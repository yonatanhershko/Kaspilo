# Money rules

- Store every amount as an integer in minor units (agorot / cents). Postgres `bigint`, TypeScript `number` holding an integer. Never `float`, `real`, `double precision`, or `numeric` for stored amounts.
- Parse user input from string to minor units without floating-point math. Use `parseAmount` from `packages/shared`. Reject more than 2 decimals.
- Amounts are always positive. Direction comes from `type` (`income` | `expense`), not from the sign.
- Currency is a per-user display preference (`ILS` | `USD` | `EUR`). No conversion. Format with `formatMoney` from `packages/shared` only.
- Percentages: compute from integers, round half-up to 1 decimal for display. Division by zero shows 0%.
- Splitting an amount (installments): every part gets `floor(total / n)`, the remainder goes to the first payment. Sum of parts must equal the total. Test it.
- Period = the user's budget month. Starts on `month_start_day` (1–28), ends the day before the next start. All totals, budgets and stats use the same period helper from `packages/shared`.
- Dates of transactions are calendar dates (`date`), not timestamps. No timezone shifting.
- Any new rule that changes a number the user sees must be written in `docs/spec.md` first.
