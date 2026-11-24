/**
 * revenuecat-webhook: RevenueCat tells us a store subscription changed
 * (purchase, trial, renewal, cancel, refund, billing problem, expiry, transfer).
 * docs/spec.md "Subscription and access".
 *
 *   POST <RevenueCat event>   Authorization: <REVENUECAT_WEBHOOK_SECRET>
 *   -> 200 { ok: true }       (any other status makes RevenueCat retry)
 *
 * Public endpoint (verify_jwt off): RevenueCat has no Supabase session. The shared
 * secret header is the check. The event body is only a hint of WHO changed: their
 * state is always read fresh from the RevenueCat API (see _shared/revenuecat.ts).
 */
import {
  analyticsFor,
  fail,
  RC_SECRET,
  type RcEvent,
  reply,
  SECRET,
  sameSecret,
  SUPABASE_URL,
  syncUser,
  usersOf,
  WEBHOOK_SECRET,
} from '../_shared/revenuecat.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method');
  if (!WEBHOOK_SECRET || !RC_SECRET || !SECRET || !SUPABASE_URL) {
    console.error('[revenuecat-webhook] not configured: REVENUECAT_WEBHOOK_SECRET, REVENUECAT_SECRET_KEY');
    return fail(500, 'not_configured');
  }
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(auth, WEBHOOK_SECRET.replace(/^Bearer\s+/i, ''))) return fail(401, 'unauthorized');

  const body = (await req.json().catch(() => null)) as { event?: RcEvent } | null;
  const event = body?.event;
  if (!event?.type) return fail(400, 'bad_request');
  if (event.type === 'TEST') return reply(200, { ok: true, test: true });

  const users = usersOf(event);
  // An anonymous buyer (no Kaspilo account yet) is synced when they sign in.
  if (users.length === 0) return reply(200, { ok: true, users: 0 });

  try {
    const analytics = analyticsFor(event);
    for (const [i, userId] of users.entries()) {
      // Count the analytics event once, on the first user; every user gets the fresh state.
      const id = event.id ? `${event.id.slice(0, 90)}:${i}` : undefined;
      await syncUser(userId, id ? { id, type: event.type.slice(0, 40), analytics: i === 0 ? analytics : null } : undefined);
    }
    return reply(200, { ok: true, users: users.length });
  } catch (e) {
    // RevenueCat retries on 5xx with backoff.
    console.error('[revenuecat-webhook] failed', event.type, e instanceof Error ? e.message : 'unknown');
    return fail(500, 'failed');
  }
});
