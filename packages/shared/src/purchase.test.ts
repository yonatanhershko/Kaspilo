import { describe, expect, it } from 'vitest';

import { MAX_AMOUNT_MINOR } from './money';
import { purchasePrefill } from './purchase';

describe('purchasePrefill', () => {
  it('fills amount and merchant when the currency is the user\'s', () => {
    expect(purchasePrefill({ amountMinor: 4590, currency: 'ILS', merchant: 'Shufersal' }, 'ILS')).toEqual({
      amountMinor: 4590,
      description: 'Shufersal',
    });
    expect(purchasePrefill({ amountMinor: '1200', currency: 'usd', merchant: 'Amazon' }, 'USD')).toEqual({
      amountMinor: 1200,
      description: 'Amazon',
    });
  });

  it('leaves the amount empty in another currency (no conversion)', () => {
    expect(purchasePrefill({ amountMinor: 2000, currency: 'USD', merchant: 'Amazon' }, 'ILS')).toEqual({
      amountMinor: null,
      description: 'Amazon',
    });
    expect(purchasePrefill({ amountMinor: 2000, merchant: 'Amazon' }, 'ILS').amountMinor).toBeNull();
  });

  it('rejects amounts that are not a positive whole number of minor units', () => {
    for (const amountMinor of [0, -5, 12.5, '12.50', '1e3', 'abc', NaN, MAX_AMOUNT_MINOR + 1, null, undefined]) {
      expect(purchasePrefill({ amountMinor, currency: 'ILS' }, 'ILS').amountMinor).toBeNull();
    }
    expect(purchasePrefill({ amountMinor: MAX_AMOUNT_MINOR, currency: 'ILS' }, 'ILS').amountMinor).toBe(
      MAX_AMOUNT_MINOR,
    );
  });

  it('cleans the merchant: control characters, extra spaces, 200 characters at most', () => {
    expect(purchasePrefill({ merchant: '  Super\n\tPharm  ' }, 'ILS').description).toBe('Super Pharm');
    expect(purchasePrefill({ merchant: 'x'.repeat(300) }, 'ILS').description).toHaveLength(200);
    expect(purchasePrefill({ merchant: 42 }, 'ILS').description).toBe('');
    expect(purchasePrefill({}, 'ILS')).toEqual({ amountMinor: null, description: '' });
  });
});
