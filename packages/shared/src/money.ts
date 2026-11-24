/**
 * Money helpers. Every amount is an integer in minor units (agorot / cents).
 * No floating-point math touches an amount. Rules: .claude/rules/money.md
 */
export type Currency = 'ILS' | 'USD' | 'EUR';

export const currencySymbol: Record<Currency, string> = { ILS: '₪', USD: '$', EUR: '€' };

/** Largest amount accepted from input: 999,999,999.99 */
export const MAX_AMOUNT_MINOR = 99_999_999_999;

/**
 * Parse what a user typed ("250", "12.5", "1,234.56") into minor units.
 * Returns null when it is not a valid positive amount: empty, zero, negative,
 * more than 2 decimals, letters, or above the maximum.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/[,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '');
  if (whole.length > 9) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const minor = Number(whole) * 100 + Number(fraction);
  if (minor <= 0 || minor > MAX_AMOUNT_MINOR) return null;
  return minor;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1,850" or "12.50": decimals only when there are any. No currency sign. */
export function formatAmount(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = groupThousands(String(Math.floor(abs / 100)));
  const fraction = abs % 100;
  const text = fraction === 0 ? whole : `${whole}.${String(fraction).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** "₪ 1,850". The sign is a display choice only; nothing is converted. */
export function formatMoney(minor: number, currency: Currency): string {
  return `${currencySymbol[currency]} ${formatAmount(minor)}`;
}

/** Minor units back to an editable string: 25000 -> "250", 1250 -> "12.50". */
export function amountToInput(minor: number): string {
  return formatAmount(minor).replace(/,/g, '');
}

/**
 * Share of a total as a percentage with one decimal, rounded half-up,
 * computed with integers. 0 when the total is 0.
 */
export function percentOf(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  // tenths of a percent, half-up: floor((part * 2000 + total) / (2 * total))
  const tenths = Math.floor((part * 2000 + total) / (2 * total));
  return tenths / 10;
}

/** Paywall: the yearly price per month, in minor units, rounded half-up (₪112.90 -> ₪9.41). */
export function yearlyPerMonth(yearly: number): number {
  return Math.floor((yearly * 2 + 12) / 24);
}

/**
 * Paywall saving badge: 1 - yearly / (12 x monthly) as a whole percent, rounded DOWN
 * (owner 2026-11-24: ₪12.90 / ₪112.90 -> 27). 0 when there is no saving.
 */
export function yearlySavingPercent(monthly: number, yearly: number): number {
  const full = monthly * 12;
  if (full <= 0 || yearly >= full) return 0;
  return Math.floor(((full - yearly) * 100) / full);
}

/** Money left in a period: income minus goal deposits minus expenses. Negative means overspent. */
export function periodBalance(income: number, saved: number, expense: number): number {
  return income - saved - expense;
}

/** Budget left. Negative means over budget. */
export function budgetRemaining(budget: number, spent: number): number {
  return budget - spent;
}

/**
 * Split a total into `count` payments. Every payment is floor(total / count);
 * the remainder goes on the first payment, so the parts always sum to the total.
 */
export function splitInstallments(total: number, count: number): number[] {
  if (!Number.isInteger(total) || !Number.isInteger(count) || total <= 0 || count < 1) {
    throw new Error('splitInstallments needs a positive integer total and count');
  }
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}
