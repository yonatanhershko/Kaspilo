import { type Currency, MAX_AMOUNT_MINOR } from './money';

/**
 * A purchase the phone caught from Apple Pay / Google Pay (docs/spec.md "Purchase detected").
 * Comes from a notification's data, so every field is untrusted and may be missing.
 */
export type DetectedPurchase = { amountMinor?: unknown; currency?: unknown; merchant?: unknown };

/** What the expense sheet opens with. Never a category: the user always picks it. */
export type PurchasePrefill = { amountMinor: number | null; description: string };

const DESCRIPTION_MAX = 200;

function toMinor(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'string' && /^\d{1,11}$/.test(value)) return Number(value);
  return null;
}

/**
 * The amount is filled only when it is a positive whole number of minor units in the user's
 * own currency: amounts are never converted, so a purchase in another currency leaves the
 * amount empty. The merchant name becomes the description.
 */
export function purchasePrefill(purchase: DetectedPurchase, userCurrency: Currency): PurchasePrefill {
  const minor = toMinor(purchase.amountMinor);
  const sameCurrency =
    typeof purchase.currency === 'string' && purchase.currency.trim().toUpperCase() === userCurrency;
  const amountMinor = sameCurrency && minor !== null && minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
  const description =
    typeof purchase.merchant === 'string'
      ? purchase.merchant
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001F\u007F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, DESCRIPTION_MAX)
      : '';
  return { amountMinor, description };
}
