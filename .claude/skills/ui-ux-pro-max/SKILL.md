---
name: ui-ux-pro-max
description: Design system, visual polish, illustration and micro-interactions for Kaspilo. Use when creating or restyling screens, tokens, leaf art, the wallet logo, or animations.
---

# UI/UX pro max

Look: warm paper background, deep green, soft peach accent, rounded cards, leaves. Calm, friendly, not a bank.

- Match the existing leaf art and screens first (the owner's original mockups are in git history). Extend their style; do not replace it.
- Tokens come from `packages/tokens`. Add a token before adding a new color or size.
- Hierarchy on every screen: one big number, one primary action, the rest quiet.
- Leaves: layered clusters in corners and behind hero art, 2–3 green tones, low contrast against the background, never behind body text. More on auth and empty states, fewer on dense lists.
- Wallet: the hero on login and every register step, with leaves that sway in 3D (rotateY / rotateX with perspective, 2–4 s, eased). On home it is the small moving logo.
- Motion: press feedback under 150 ms, sheets ~250 ms, decorative loops slow. Reduce-motion turns loops off.
- Progress bars: green → red only when over budget, with bold red amount.
- Small helper numbers (like "left ₪900") are 11–12 pt, muted, aligned to the edge, never competing with the main amount.
- Check every screen in light, dark, Hebrew, English, small phone and large phone.
