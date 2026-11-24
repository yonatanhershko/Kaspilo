// deno test supabase/functions  — pure logic of the RevenueCat functions, no network.
import { analyticsFor, planOf, sameSecret, toState, usersOf } from './revenuecat.ts';

function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${name}: expected ${e}, got ${a}`);
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const future = new Date(Date.now() + 10 * 86400_000).toISOString();
const later = new Date(Date.now() + 16 * 86400_000).toISOString();
const past = new Date(Date.now() - 86400_000).toISOString();

Deno.test('plan from product id (Apple and Google ids)', () => {
  eq(planOf('kaspilo_monthly'), 'monthly', 'apple monthly');
  eq(planOf('kaspilo_yearly'), 'yearly', 'apple yearly');
  eq(planOf('kaspilo_access:monthly'), 'monthly', 'google monthly');
  eq(planOf('kaspilo_access:yearly'), 'yearly', 'google yearly');
  eq(planOf('something'), null, 'unknown');
});

Deno.test('no entitlement -> no store state', () => {
  eq(toState({}), null, 'empty');
  eq(toState({ entitlements: { other: { product_identifier: 'x', expires_date: future } } }), null, 'other entitlement');
});

Deno.test('trial, renewing', () => {
  const s = toState({
    entitlements: { access: { product_identifier: 'kaspilo_yearly', expires_date: future } },
    subscriptions: { kaspilo_yearly: { store: 'app_store', period_type: 'trial', expires_date: future } },
  });
  eq(s?.plan, 'yearly', 'plan');
  eq(s?.period_type, 'trial', 'period');
  eq(s?.store, 'app_store', 'store');
  eq(s?.will_renew, true, 'renews');
  eq(s?.expires_at, new Date(future).toISOString(), 'end');
});

Deno.test('grace period extends access; billing issue kept', () => {
  const s = toState({
    entitlements: { access: { product_identifier: 'kaspilo_monthly', expires_date: past } },
    subscriptions: {
      kaspilo_monthly: { store: 'play_store', period_type: 'normal', grace_period_expires_date: later, billing_issues_detected_at: past },
    },
  });
  eq(s?.expires_at, new Date(later).toISOString(), 'grace end wins');
  eq(s?.billing_issue_at, past, 'billing issue');
});

Deno.test('cancelled or refunded does not renew', () => {
  const cancelled = toState({
    entitlements: { access: { product_identifier: 'kaspilo_monthly', expires_date: future } },
    subscriptions: { kaspilo_monthly: { store: 'app_store', unsubscribe_detected_at: past } },
  });
  eq(cancelled?.will_renew, false, 'cancelled');
  const refunded = toState({
    entitlements: { access: { product_identifier: 'kaspilo_monthly', expires_date: past } },
    subscriptions: { kaspilo_monthly: { store: 'app_store', refunded_at: past } },
  });
  eq(refunded?.will_renew, false, 'refunded');
  eq(refunded?.refunded_at, past, 'refunded at');
});

Deno.test('unknown store is "other"; lifetime (no end) is ignored', () => {
  eq(toState({
    entitlements: { access: { product_identifier: 'kaspilo_monthly', expires_date: future } },
    subscriptions: { kaspilo_monthly: { store: 'stripe' } },
  })?.store, 'other', 'stripe');
  eq(toState({ entitlements: { access: { product_identifier: 'kaspilo_life', expires_date: null } } }), null, 'lifetime');
});

Deno.test('analytics event per webhook type', () => {
  eq(analyticsFor({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL' }), 'trial_started', 'trial');
  eq(analyticsFor({ type: 'INITIAL_PURCHASE', period_type: 'NORMAL' }), 'subscribed', 'direct');
  eq(analyticsFor({ type: 'RENEWAL', is_trial_conversion: true }), 'subscribed', 'trial converted');
  eq(analyticsFor({ type: 'RENEWAL' }), 'renewed', 'renewal');
  eq(analyticsFor({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }), 'refunded', 'refund');
  eq(analyticsFor({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }), 'cancelled', 'cancel');
  eq(analyticsFor({ type: 'BILLING_ISSUE' }), 'billing_issue', 'billing');
  eq(analyticsFor({ type: 'EXPIRATION' }), null, 'expiration');
});

Deno.test('users of an event: Kaspilo ids only, both sides of a transfer', () => {
  eq(usersOf({ type: 'RENEWAL', app_user_id: U1, original_app_user_id: U1, aliases: [U1, '$RCAnonymousID:abc'] }), [U1], 'dedupe');
  eq(usersOf({ type: 'TRANSFER', transferred_from: [U1], transferred_to: [U2] }), [U1, U2], 'transfer');
  eq(usersOf({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc' }), [], 'anonymous');
});

Deno.test('secret compare', () => {
  eq(sameSecret('abc', 'abc'), true, 'same');
  eq(sameSecret('abc', 'abd'), false, 'different');
  eq(sameSecret('abc', 'abcd'), false, 'length');
  eq(sameSecret('', 'x'), false, 'empty');
});
