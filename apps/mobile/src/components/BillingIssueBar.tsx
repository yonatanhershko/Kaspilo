import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/AuthProvider';
import { inBillingGrace, useStoreSubscription } from '@/data/subscription';
import { useRowAlign } from '@/i18n';
import { openManageSubscriptions } from '@/lib/purchases';

import { AppText } from './ui/AppText';
import { Icon } from './ui/Icon';
import { PressScale } from './ui/PressScale';

/**
 * Home bar while the store retries a failed payment (docs/spec.md "Billing problems").
 * Tap opens the store's subscription page to update the payment method.
 */
export function BillingIssueBar() {
  const { t } = useTranslation();
  const align = useRowAlign();
  const userId = useAuth().session?.user.id ?? null;
  const { data } = useStoreSubscription();
  if (!inBillingGrace(data)) return null;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityHint={t('billing.hint')}
      onPress={() => void openManageSubscriptions(userId)}
      className={`mt-3 min-h-[44px] items-center gap-2 rounded-lg border border-accent bg-surface px-3 ${align.row}`}>
      <Icon name="credit-card-off-outline" size={18} tone="primary" />
      <AppText className="flex-1 text-[14px]">{t('billing.bar')}</AppText>
      <Icon name={align.he ? 'chevron-left' : 'chevron-right'} size={20} tone="muted" />
    </PressScale>
  );
}
