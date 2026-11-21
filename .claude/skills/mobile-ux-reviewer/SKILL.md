---
name: mobile-ux-reviewer
description: Audit Kaspilo mobile screens for UX quality, Apple HIG and Material 3 compliance, and accessibility. Use after building a screen and before calling it done.
---

# Mobile UX reviewer

Run the screen, then report findings as: severity (blocker / should fix / nice), where, what, fix.

Checklist:

- **Flow:** main task reachable in the fewest taps. No dead ends. Back always works. Destructive actions confirm.
- **States:** loading, empty, error (with retry), success feedback, offline.
- **Touch:** targets ≥ 44×44 pt (iOS) / 48×48 dp (Android). Nothing important under the home indicator or notch; safe areas respected.
- **Text:** readable at large font scale; no clipped Hebrew; numbers and currency not mirrored.
- **RTL:** layout mirrors, directional icons flip, swipe directions make sense.
- **Contrast:** ≥ 4.5:1 for text, ≥ 3:1 for icons and bars, both themes. Color is never the only signal (over-budget also says it in words).
- **Screen readers:** every control has a label and role; amounts read with currency; decorative leaves hidden from accessibility.
- **Keyboard:** right keyboard type, fields not covered, done/next works.
- **Platform:** sheets, pickers and navigation feel native on each OS.
- **Motion:** honors reduce-motion; nothing flashes.
