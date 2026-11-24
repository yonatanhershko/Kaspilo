/**
 * revenuecat-sync: the app asks the server to re-read the signed-in user's store
 * subscription, right after a purchase or "Restore purchases", so access opens without
 * waiting for the webhook. The phone's own purchase result is never trusted.
 * docs/spec.md "Subscription and access".
 *
 *   POST { action: "sync" }    -> { status, expires_at }
 *   POST { action: "forget" }  -> { forgotten: true }   (before account deletion:
 *                                  removes the user from RevenueCat; the store
 *                                  subscription itself is cancelled only in the store)
 *
 * Signed-in endpoint (verify_jwt on). Rate-limited in the database (store_sync_check).
 */
import { cors, deleteSubscriber, fail, isUserId, RC_SECRET, reply, rpc, SECRET, SUPABASE_URL, syncUser } from '../_shared/revenuecat.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method');
  if (!RC_SECRET || !SECRET || !SUPABASE_URL) {
    console.error('[revenuecat-sync] not configured: REVENUECAT_SECRET_KEY');
    return fail(500, 'not_configured');
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'unauthorized');
  const action = ((await req.json().catch(() => ({}))) as { action?: unknown }).action ?? 'sync';
  if (action !== 'sync' && action !== 'forget') return fail(400, 'bad_request');

  try {
    // Who is calling (from their own session), and are they within the limit.
    const check = await rpc('store_sync_check', {}, token);
    if (check.status === 401 || check.status === 403) return fail(401, 'unauthorized');
    if (!check.ok) {
      const code = (check.json as { code?: string } | null)?.code;
      if (code === 'PT429') return fail(429, 'rate_limited');
      return fail(502, 'failed');
    }
    const userId = check.json;
    if (!isUserId(userId)) return fail(401, 'unauthorized');

    if (action === 'forget') {
      await deleteSubscriber(userId);
      return reply(200, { forgotten: true });
    }
    return reply(200, await syncUser(userId));
  } catch (e) {
    console.error('[revenuecat-sync] failed', e instanceof Error ? e.message : 'unknown');
    return fail(502, 'failed');
  }
});
