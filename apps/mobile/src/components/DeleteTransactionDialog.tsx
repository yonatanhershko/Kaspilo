import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMoney } from '@/data/hooks';
import type { ListedTransaction } from '@/data/outbox';
import { useDeleteTransaction } from '@/data/queries';
import { OfflineError } from '@/lib/network';

import { AppText } from './ui/AppText';
import { Dialog } from './ui/Dialog';

export function DeleteTransactionDialog({
  transaction,
  onClose,
}: {
  transaction: ListedTransaction | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const remove = useDeleteTransaction();
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Dialog
      visible={!!transaction}
      title={t('transactions.deleteTitle')}
      onClose={close}
      actions={[
        {
          label: t('common.delete'),
          variant: 'accent',
          loading: remove.isPending,
          onPress: async () => {
            if (!transaction) return close();
            try {
              await remove.mutateAsync(transaction);
              close();
            } catch (e) {
              setError(t(e instanceof OfflineError ? 'offline.needsInternet' : 'common.errorGeneric'));
            }
          },
        },
        { label: t('common.cancel'), variant: 'outline', onPress: close },
      ]}>
      <AppText className="text-[15px]">
        {transaction ? `${transaction.description || ''} ${money.format(transaction.amount)}`.trim() : ''}
      </AppText>
      {error && (
        <AppText tone="danger" className="mt-2 text-[14px]" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      )}
    </Dialog>
  );
}
