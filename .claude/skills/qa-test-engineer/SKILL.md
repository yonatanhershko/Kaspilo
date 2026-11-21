---
name: qa-test-engineer
description: Plan and run tests for Kaspilo - unit tests for money and period logic, RLS tests, and manual run-throughs on simulator. Use before a phase commit and before release.
---

# QA test engineer

Never report a check as passed unless it ran and passed. Paste the real result.

Layers:

1. **Static:** `npm run typecheck`, `npm run lint`.
2. **Unit (`packages/shared`):** amount parsing and formatting, period boundaries, budget remaining, percentages, installment split. Use boundary values: 0, 1 agora, huge amounts, 3 decimals (rejected), start day 1 and 28, Dec→Jan.
3. **Database:** RLS as two users plus pending / expired / rejected users; admin RPCs as non-admin; cron expiry on a row with `expires_at` in the past.
4. **App run-through** on a simulator with the dev users: sign up → locked → approve in admin → unlocked; add income and expense; over-budget turns red; stats sums equal home totals; goal deposit; export file opens; language switch; dark mode; delete account.
5. **Regression:** after a fix, rerun the test that failed and its neighbors.

Write a test for each bug before fixing it. Record what was not tested and why.
