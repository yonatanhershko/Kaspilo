import type {
  AccessMonths,
  AccessPlan,
  DashboardStats,
  NotificationCatalogItem,
  NotificationKind,
  Profile,
  PushAudience,
  StoreSubscription,
  SubscriptionEvent,
  SubscriptionReport,
} from "@kaspilo/shared";

import { supabase } from "@/lib/supabase";

/** Every call here runs as the signed-in admin; the database checks the role. */

export const PAGE_SIZE = 25;

export async function fetchStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error) throw error;
  return data;
}

/** A user row with the store subscription the server last saw (null = none). */
export type AdminUser = Profile & { store_subscriptions: StoreSubscription | null };

export type UserPage = { rows: AdminUser[]; total: number };

/** docs/spec.md "Admin web": the user list filters. */
export type UserFilter = "all" | "without_access" | "ending" | "trial" | "paying" | "admin";

export async function fetchUsers(options: {
  filter?: UserFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserPage> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const from = (options.page ?? 0) * pageSize;
  const filter = options.filter ?? "all";
  const now = new Date().toISOString();
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString();
  // Trial and paying need a store row: an inner join keeps only users that have one.
  const store =
    filter === "trial" || filter === "paying" ? "store_subscriptions!inner(*)" : "store_subscriptions(*)";

  let query = supabase.from("profiles").select(`*, ${store}`, { count: "exact" }).eq("role", "client");

  if (filter === "without_access") query = query.or(`status.neq.active,expires_at.lt.${now}`);
  if (filter === "ending") query = query.eq("status", "active").gt("expires_at", now).lte("expires_at", week);
  if (filter === "trial") {
    query = query.eq("store_subscriptions.period_type", "trial").gt("store_subscriptions.expires_at", now);
  }
  if (filter === "paying") {
    query = query.neq("store_subscriptions.period_type", "trial").gt("store_subscriptions.expires_at", now);
  }
  if (filter === "admin") {
    query = query.eq("status", "active").eq("access_via", "grant").or(`expires_at.is.null,expires_at.gt.${now}`);
  }

  // Strip characters that have meaning in a PostgREST filter before searching.
  const term = options.search?.trim().replace(/[%,()\\*]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);

  const { data, error, count } = await query
    .order(filter === "ending" ? "expires_at" : "created_at", { ascending: filter === "ending" })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return { rows: data as unknown as AdminUser[], total: count ?? 0 };
}

async function run(call: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await call;
  if (error) throw new Error(error.message);
}

/** Admin grant (docs/spec.md "Admin grants"): a length in months, an end date, or none (family). */
export type GrantLength = { months: AccessMonths } | { until: string } | null;

export const grantAccess = (userId: string, plan: AccessPlan, length: GrantLength, note: string) =>
  run(
    supabase.rpc("admin_grant_access", {
      p_user_id: userId,
      p_plan: plan,
      p_months: length && "months" in length ? length.months : null,
      p_until: length && "until" in length ? length.until : null,
      p_note: note.trim() || null,
    }),
  );

/** Ends admin-granted access only; a store subscription is untouched. */
export const revokeAccess = (userId: string, note: string) =>
  run(supabase.rpc("admin_revoke_access", { p_user_id: userId, p_note: note.trim() || null }));

/** Admin actions and store changes for one user, newest first. */
export async function fetchHistory(userId: string): Promise<SubscriptionEvent[]> {
  const { data, error } = await supabase
    .from("subscription_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchSubscriptionReport(from: string, to: string): Promise<SubscriptionReport> {
  const { data, error } = await supabase.rpc("admin_subscription_report", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data;
}

// ---- manual notifications ---------------------------------------------------

export async function fetchNotificationCatalog(): Promise<NotificationCatalogItem[]> {
  const { data, error } = await supabase.rpc("admin_notification_catalog");
  if (error) throw new Error(error.message);
  return data;
}

/** Who a send would reach. `userId` null = all active users. */
export async function fetchPushAudience(userId: string | null, kind: string): Promise<PushAudience> {
  const { data, error } = await supabase.rpc("admin_push_audience", { p_user_id: userId, p_kind: kind });
  if (error) throw new Error(error.message);
  return data;
}

export type NotificationChoice =
  | { kind: NotificationKind }
  | { kind: "custom"; title: string; body: string };

/**
 * Test of "Purchase detected" (docs/spec.md "Manual send"): the phone's purchase reminder,
 * sent as a push so it can be seen on a device. Returns how many devices it went to.
 */
export async function sendPurchaseTest(
  userId: string | null,
  amountMinor: number,
  merchant: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("admin_send_purchase_test", {
    p_user_id: userId,
    p_amount_minor: amountMinor,
    p_merchant: merchant,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Sends now. Returns how many devices it went to. `userId` null = all active users. */
export async function sendNotification(
  userId: string | null,
  choice: NotificationChoice,
): Promise<number> {
  const { data, error } = await supabase.rpc("admin_send_notification", {
    p_user_id: userId,
    p_kind: choice.kind,
    p_title: choice.kind === "custom" ? choice.title : null,
    p_body: choice.kind === "custom" ? choice.body : null,
  });
  if (error) throw new Error(error.message);
  return data;
}
