/**
 * Shared by revenuecat-webhook and revenuecat-sync (docs/spec.md "Subscription and access").
 *
 * RevenueCat is the truth for store subscriptions. We never trust an event body or the
 * phone: every change re-reads the customer from the RevenueCat API and hands the result
 * to public.store_apply(), which recomputes access. Applying the same state twice is a
 * no-op, so repeats and out-of-order events are safe.
 *
 * Secrets (Supabase function secrets only, never in the app):
 *   REVENUECAT_SECRET_KEY      RevenueCat secret API key (sk_…)
 *   REVENUECAT_WEBHOOK_SECRET  the Authorization value set on the RevenueCat webhook
 *   REVENUECAT_ENTITLEMENT     entitlement id, default "access"
 * Never logs keys, tokens, emails or the raw event.
 */

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
export const RC_SECRET = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';
export const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'access';
const RC_API = 'https://api.revenuecat.com/v1';

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const value = (JSON.parse(keys) as Record<string, string>).default;
      if (value) return value;
    } catch {
      // fall through to the single-key variables (local CLI)
    }
  }
  return Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}
export const SECRET = secretKey();

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const fail = (status: number, code: string) => reply(status, { code });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Our RevenueCat customer ids are Supabase user ids; anonymous ids ($RCAnonymousID:…) are skipped. */
export const isUserId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id);

/** Same length and same bytes, without stopping at the first difference. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// ---- Webhook events ------------------------------------------------------------------

export type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  period_type?: string;
  is_trial_conversion?: boolean;
  cancel_reason?: string;
};

/** The analytics event this webhook event stands for, if any (docs/spec.md "Analytics"). */
export function analyticsFor(e: RcEvent): string | null {
  switch (e.type) {
    case 'INITIAL_PURCHASE':
      return e.period_type === 'TRIAL' ? 'trial_started' : 'subscribed';
    case 'RENEWAL':
      return e.is_trial_conversion ? 'subscribed' : 'renewed';
    case 'CANCELLATION':
      return e.cancel_reason === 'CUSTOMER_SUPPORT' ? 'refunded' : 'cancelled';
    case 'BILLING_ISSUE':
      return 'billing_issue';
    default:
      return null;
  }
}

/** Every Kaspilo user this event touches: both sides of a transfer, else the customer and its aliases. */
export function usersOf(e: RcEvent): string[] {
  const ids = e.type === 'TRANSFER'
    ? [...(e.transferred_from ?? []), ...(e.transferred_to ?? [])]
    : [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])];
  return [...new Set(ids.filter(isUserId).map((id) => id.toLowerCase()))];
}

// ---- Supabase -----------------------------------------------------------------------

/** Calls a database function. With `bearer` it runs as that signed-in user, else with the secret key. */
export async function rpc(name: string, args: Record<string, unknown>, bearer?: string) {
  const headers: Record<string, string> = { apikey: SECRET, 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  else if (SECRET.startsWith('eyJ')) headers.Authorization = `Bearer ${SECRET}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const json = (await res.json().catch(() => null)) as unknown;
  return { ok: res.ok, status: res.status, json };
}

// ---- RevenueCat ---------------------------------------------------------------------

export type StoreState = {
  store: 'app_store' | 'play_store' | 'test_store' | 'promotional' | 'other';
  product_id: string;
  plan: 'monthly' | 'yearly' | null;
  period_type: 'trial' | 'intro' | 'normal';
  expires_at: string;
  will_renew: boolean;
  billing_issue_at: string | null;
  refunded_at: string | null;
  is_sandbox: boolean;
};

type RcSubscription = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string;
  store?: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
  is_sandbox?: boolean;
};
type RcEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
};
export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
};

const KNOWN_STORES = new Set(['app_store', 'play_store', 'test_store', 'promotional']);

/** "kaspilo_monthly", "kaspilo_access:monthly" (Google base plan) → monthly. */
export function planOf(productId: string): 'monthly' | 'yearly' | null {
  const p = productId.toLowerCase();
  if (/month/.test(p)) return 'monthly';
  if (/year|annual/.test(p)) return 'yearly';
  return null;
}

const later = (a?: string | null, b?: string | null): string | null => {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
};

/**
 * Our view of the customer: the "access" entitlement and the subscription behind it.
 * Access lasts to the later of the end date and the grace period's end.
 * Null when the customer never had the entitlement, or it has no end date
 * (a lifetime product, which Kaspilo does not sell).
 */
export function toState(sub: RcSubscriber): StoreState | null {
  const ent = sub.entitlements?.[ENTITLEMENT];
  if (!ent?.product_identifier) return null;
  const s = sub.subscriptions?.[ent.product_identifier] ?? {};
  const end = later(later(ent.expires_date, ent.grace_period_expires_date), s.grace_period_expires_date);
  if (!end || Number.isNaN(Date.parse(end))) return null;
  const period = s.period_type === 'trial' || s.period_type === 'intro' ? s.period_type : 'normal';
  const store = s.store && KNOWN_STORES.has(s.store) ? (s.store as StoreState['store']) : 'other';
  return {
    store,
    product_id: ent.product_identifier.slice(0, 100),
    plan: planOf(ent.product_identifier),
    period_type: period,
    expires_at: new Date(end).toISOString(),
    // Renews unless the user turned it off, it was refunded, or it already ended.
    will_renew: !s.unsubscribe_detected_at && !s.refunded_at && Date.parse(end) > Date.now(),
    billing_issue_at: s.billing_issues_detected_at ?? null,
    refunded_at: s.refunded_at ?? null,
    is_sandbox: s.is_sandbox === true,
  };
}

/** The customer from the RevenueCat API. Throws when RevenueCat cannot be reached. */
export async function fetchSubscriber(userId: string): Promise<RcSubscriber> {
  const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${RC_SECRET}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`revenuecat ${res.status}`);
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? {};
}

/** Removes the customer from RevenueCat (account deletion). A missing customer is fine. */
export async function deleteSubscriber(userId: string): Promise<void> {
  const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${RC_SECRET}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`revenuecat delete ${res.status}`);
}

/** Reads the customer fresh and stores it. Returns the user's new access end (or null). */
export async function syncUser(
  userId: string,
  event?: { id: string; type: string; analytics: string | null },
): Promise<{ status: string | null; expires_at: string | null }> {
  const state = toState(await fetchSubscriber(userId));
  const r = await rpc('store_apply', {
    p_user_id: userId,
    p_state: state,
    p_event_id: event?.id ?? null,
    p_event_type: event?.type ?? null,
    p_analytics: event?.analytics ?? null,
  });
  if (!r.ok) throw new Error(`store_apply ${r.status}`);
  const p = r.json as { status?: string; expires_at?: string | null } | null;
  return { status: p?.status ?? null, expires_at: p?.expires_at ?? null };
}
