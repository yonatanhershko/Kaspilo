import { formatAmount, type GoalDeposit, type Transaction } from '@kaspilo/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type ExportLabels = {
  headers: { date: string; type: string; category: string; description: string; amount: string };
  income: string;
  expense: string;
  /** Type label of a goal deposit. */
  savings: string;
  /** Type label of money the user already had saved: not part of the balance. */
  alreadySaved: string;
};

function cell(value: string): string {
  // Quote everything; neutralize cells a spreadsheet would run as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * CSV text that Excel and Google Sheets open directly, Hebrew included.
 * Goal deposits are rows too: type "Savings", category = goal name. Same positive
 * amount as everywhere; the type says it comes off the balance. Money saved before
 * has its own type ("Already saved") and is not part of the balance.
 */
export function buildCsv(
  transactions: Transaction[],
  deposits: GoalDeposit[],
  categoryName: (id: string) => string,
  goalName: (id: string) => string,
  labels: ExportLabels,
): string {
  const h = labels.headers;
  const rows = [
    ...transactions.map((tx) => ({
      date: tx.date,
      at: tx.created_at,
      type: tx.type === 'income' ? labels.income : labels.expense,
      category: categoryName(tx.category_id),
      description: tx.description,
      amount: tx.amount,
    })),
    ...deposits.map((d) => ({
      date: d.date,
      at: d.created_at,
      type: d.source === 'existing' ? labels.alreadySaved : labels.savings,
      category: goalName(d.goal_id),
      description: '',
      amount: d.amount,
    })),
  ].sort((a, b) => (a.date === b.date ? b.at.localeCompare(a.at) : b.date.localeCompare(a.date)));

  const lines = [[h.date, h.type, h.category, h.description, h.amount].map(cell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        cell(row.date),
        cell(row.type),
        cell(row.category),
        cell(row.description),
        // plain number so the sheet can sum it; exact, from integer minor units
        formatAmount(row.amount).replace(/,/g, ''),
      ].join(','),
    );
  }
  // The byte-order mark makes Excel read the file as UTF-8.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Save / share the CSV. Returns false when sharing is not possible on this device. */
export async function shareCsv(csv: string, fileName: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  // Wait for the write: sharing a half-written file gives an empty sheet.
  await file.write(csv);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  return true;
}
