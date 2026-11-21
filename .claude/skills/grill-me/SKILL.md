---
name: grill-me
description: Interview the owner to sharpen a plan before building a substantial Kaspilo feature. Use when requirements are unclear or a business rule is not in docs/spec.md.
---

# Grill me

Goal: an implementation-ready spec the owner approved. No code before that.

1. Read `docs/spec.md`, the relevant code, and any reference images first. Do not ask what the repo already answers.
2. Ask about what is missing. One question at a time when the answer changes the next question; a short numbered list when the questions are independent.
3. Every question carries a recommended answer, so the owner can say "ok".
4. Always cover: who can do it, what data changes, money effect (totals, budgets, stats), empty / error / offline cases, both languages, both themes.
5. Never choose a rule that changes a number the user sees. Ask.
6. Finish by writing the decisions into `docs/spec.md` and getting a clear yes.
