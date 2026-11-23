import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { OfflineBar } from '@/components/OfflineBar';
import { flushOutbox, openOutbox } from '@/data/outbox';
import { materializeRecurring, usePrefetchHistory } from '@/data/queries';
import { useWalletId } from '@/data/walletContext';
import { WalletProvider } from '@/data/WalletProvider';
import { flushAnalytics, trackAppEntry, trackAppOpen } from '@/lib/analytics';
import { onReconnect } from '@/lib/network';
import { nativeApplicationVersion } from '@/lib/nativeApp';
import { allowCache, cacheKey, cacheStorage } from '@/lib/offlineCache';
import { markFirstOpen } from '@/lib/review';
import { NotificationSetup } from '@/notifications/NotificationSetup';
import { applyPendingSetup } from '@/onboarding/store';
import { useTheme } from '@/theme/ThemeProvider';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Everything in here needs an active subscription (guard in the root layout).
 * The data cache is also kept on the phone per user (docs/spec.md "Offline"): the app
 * opens with the last data at once and refreshes in the background. Signing out clears it.
 */
export default function AppLayout() {
  const userId = useAuth().session?.user.id ?? 'none';
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Kept in memory as long as on the phone, or the saved copy would lose it.
          queries: { staleTime: 30_000, retry: 1, gcTime: WEEK_MS },
          // Run at once even offline, so the screen gets an error instead of waiting forever.
          mutations: { networkMode: 'always' },
        },
      }),
  );
  const [persister] = useState(() => {
    allowCache(userId);
    return createAsyncStoragePersister({ storage: cacheStorage, key: cacheKey(userId), throttleTime: 1000 });
  });
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: WEEK_MS,
        // A new app version starts with a fresh cache, in case the data shape changed.
        buster: nativeApplicationVersion ?? '',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}>
      <WalletProvider>
        <OutboxSync userId={userId} />
        <OnboardingSetup userId={userId} />
        <AnalyticsTracker userId={userId} />
        <OfflineBar>
          <AppStack />
        </OfflineBar>
      </WalletProvider>
    </PersistQueryClientProvider>
  );
}

/**
 * The account made from onboarding on this phone gets its budget and currency on its first
 * entry with access (docs/spec.md "Onboarding"). Tried again on reconnect if offline.
 */
function OnboardingSetup({ userId }: { userId: string }) {
  const client = useQueryClient();
  useEffect(() => {
    if (userId === 'none') return;
    const run = () =>
      void applyPendingSetup(userId).then((changed) => {
        if (!changed) return;
        void client.invalidateQueries({ queryKey: ['settings'] });
        void client.invalidateQueries({ queryKey: ['wallets'] });
      });
    run();
    return onReconnect(run);
  }, [client, userId]);
  return null;
}

/** Sends transactions added offline: on start, when the internet is back, and on return to the app. */
function OutboxSync({ userId }: { userId: string }) {
  const client = useQueryClient();
  const wallet = useWalletId();
  const prefetchHistory = usePrefetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per wallet
  useEffect(() => void prefetchHistory(), [wallet]);
  useEffect(() => {
    const flush = () => void flushOutbox(client);
    void openOutbox(userId).then(flush);
    const stopNet = onReconnect(flush);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush();
    });
    // A send can also fail while the phone thinks it is online (weak signal): try again now and then.
    const timer = setInterval(flush, 60_000);
    return () => {
      stopNet();
      app.remove();
      clearInterval(timer);
    };
  }, [client, userId]);
  return null;
}

/**
 * Product analytics (docs/spec.md "Analytics"): first entry and app opens of a user with access.
 * Everything in this group needs access, so being here is enough.
 */
function AnalyticsTracker({ userId }: { userId: string }) {
  useEffect(() => {
    if (userId === 'none') return;
    void trackAppEntry(userId);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') trackAppOpen(userId);
    });
    const stopNet = onReconnect(() => void flushAnalytics());
    return () => {
      app.remove();
      stopNet();
    };
  }, [userId]);
  return null;
}

function AppStack() {
  const { colors } = useTheme();
  const client = useQueryClient();
  const userId = useAuth().session?.user.id;

  // Starts the 7-day clock of the review prompt (docs/spec.md "About and app review").
  useEffect(() => {
    if (userId) void markFirstOpen(userId);
  }, [userId]);

  // Recurring transactions that came due since the last visit become real rows.
  useEffect(() => {
    void materializeRecurring().then((added) => {
      if (added > 0) void client.invalidateQueries();
    });
  }, [client]);

  return (
    <>
    <NotificationSetup />
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        // Swipe sideways to go back, from anywhere on the screen (iOS) or the edge (Android).
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="add"
        options={{
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          fullScreenGestureEnabled: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
    </>
  );
}
