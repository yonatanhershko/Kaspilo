---
name: financial-product-expert
description: Transaction semantics, money math, budgets, periods, recurring and installment logic, and analytics correctness for Kaspilo. Use whenever a change affects a number the user sees.
---

# Financial product expert

Source of truth: `docs/spec.md` and `.claude/rules/money.md`. If a rule is missing there, stop and ask the owner.

Check on every money change:

- **Storage:** integer minor units, positive, direction from `type`. No floats anywhere on the path from input to database to screen.
- **Period:** uses the shared period helper with the user's `month_start_day`. Edge cases: the first and last day of a period, February, year boundary, a user changing the start day.
- **Budgets:** category budget and overall budget are monthly, do not roll over. Remaining = budget − spent in period. Over budget when remaining < 0. A category with no budget shows spent only.
- **Totals:** expenses and income never net against each other unless the screen says "balance". Goal deposits are not expenses.
- **Recurring / installments:** generated occurrences are real dated transactions linked to their rule. Installment parts sum exactly to the original total. Editing or deleting a rule states what happens to past and future occurrences.
- **Percentages:** from integers, 1 decimal, half-up, parts may not sum to exactly 100 and that is acceptable; never show NaN.
- **Deletion of a category:** say what happens to its transactions before building it.
- **Currency:** display preference only. Changing it never changes stored numbers.

Every rule gets unit tests in `packages/shared` with boundary values.
