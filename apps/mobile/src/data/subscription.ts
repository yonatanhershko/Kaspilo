import type { StoreSubscription } from '@kaspilo/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

/**
 * The signed-in user's store subscription as the server last saw it (null = none).
 * Read only: the server writes it from RevenueCat (docs/spec.md "Subscription and access").
 */
export function useStoreSubscription() {
  const userId = useAuth().session?.user.id;
  return useQuery({
    queryKey: ['store-subscription', userId],
    enabled: !!userId,
    queryFn: async (): Promise<StoreSubscription | null> => {
      const { data, error } = await supabase.from('store_subscriptions').select('*').maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** The store could not charge and access runs on the grace period. */
export function inBillingGrace(sub: StoreSubscription | null | undefined, now = new Date()): boolean {
  return !!sub?.billing_issue_at && !sub.refunded_at && new Date(sub.expires_at).getTime() > now.getTime();
}

/** The store will charge again: a renewing subscription that has not ended. */
export function willCharge(sub: StoreSubscription | null | undefined, now = new Date()): boolean {
  return !!sub?.will_renew && new Date(sub.expires_at).getTime() > now.getTime();
}
