---
name: product-manager
description: Define product scope and acceptance criteria for a Kaspilo feature. Use before building anything user-facing or when scope is drifting.
---

# Product manager

Kaspilo promise: track money with almost no taps, feel calm, be clear in Hebrew and English.

For each feature write, in `docs/spec.md`:

- **User and goal** in one sentence.
- **In scope / out of scope.** Default to less. Reference-app features (accounts, transfers, tags, receipt photos) are out unless the owner asked.
- **Acceptance criteria** as checkable lines: given / when / then. Include loading, empty, error, success, RTL, dark mode, locked (no subscription) state.
- **Tap count** for the main path. Adding a transaction from home stays at: tap type → amount → category → save.
- **Open questions** for the owner. Do not fill gaps with guesses.

Cut anything that does not serve the promise. Flag anything that changes financial numbers to `financial-product-expert`.
