import type {
  AccessMonths,
  AccessPlan,
  AccountStatus,
  DashboardStats,
  NotificationCatalogItem,
  NotificationKind,
  Profile,
  PushAudience,
} from "@kaspilo/shared";

import { supabase } from "@/lib/supabase";

/** Every call here runs as the signed-in admin; the database checks the role. */

export const PAGE_SIZE = 25;

export type ProfilePage = { rows: Profile[]; total: number };

export async function fetchStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error) throw error;
  return data;
}

export async function fetchProfiles(options: {
  statuses?: AccountStatus[];
  search?: string;
  page?: number;
  pageSize?: number;
  orderBy?: "created_at" | "expires_at";
  ascending?: boolean;
}): Promise<ProfilePage> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const from = (options.page ?? 0) * pageSize;

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", "client");

  if (options.statuses?.length) query = query.in("status", options.statuses);

  // Strip characters that have meaning in a PostgREST filter before searching.
  const term = options.search?.trim().replace(/[%,()\\*]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);

  const { data, error, count } = await query
    .order(options.orderBy ?? "created_at", {
      ascending: options.ascending ?? false,
    })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function run(
  call: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await call;
  if (error) throw new Error(error.message);
}

export const approveUser = (
  userId: string,
  plan: AccessPlan,
  months: AccessMonths,
) =>
  run(
    supabase.rpc("admin_approve_user", {
      p_user_id: userId,
      p_plan: plan,
      p_months: months,
    }),
  );

export const rejectUser = (userId: string) =>
  run(supabase.rpc("admin_reject_user", { p_user_id: userId }));

export const extendUser = (userId: string, months: AccessMonths) =>
  run(
    supabase.rpc("admin_extend_user", { p_user_id: userId, p_months: months }),
  );

export const setUserPlan = (userId: string, plan: AccessPlan) =>
  run(supabase.rpc("admin_set_plan", { p_user_id: userId, p_plan: plan }));

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
