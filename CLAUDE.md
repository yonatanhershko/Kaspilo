# Kaspilo

Personal-finance mobile app (Expo) + admin web dashboard (Next.js) on one Supabase database.
Access is a yearly subscription paid by Bit and approved by hand by an admin.

@AGENTS.md

## Where things are

| Path | What |
| --- | --- |
| `apps/mobile` | Expo React Native app (iOS + Android) |
| `apps/web` | Next.js admin dashboard (Vercel) |
| `packages/tokens` | Global style: colors, spacing, radius, fonts. One source for mobile + web |
| `packages/shared` | Money math, date/period logic, shared types |
| `supabase/` | Migrations, edge functions, seed |
| `docs/spec.md` | Approved product decisions. Business rules live here |
| `evals/prod-readiness.md` | Checklist to pass before dev → prod |
| `.github/` | CI on every push (with a dependency report), manual prod deploy. See `docs/ci-cd.md` |

## Claude setup

- Rules: `.claude/rules/*.md` (always loaded). Money, security, i18n/RTL, design, git.
- Skills: `.claude/skills/<name>/SKILL.md`. One per role named in `AGENTS.md`.
- Hooks: `.claude/hooks/` wired in `.claude/settings.json`. Git hook in `.githooks/pre-commit`.

## Commands

```bash
npm install                 # root, installs all workspaces
npm run mobile              # Expo dev server (dev env)
npm run web                 # Next.js dev server
npm run typecheck           # all workspaces
npm run lint                # all workspaces
npm test                    # unit tests (shared money/date logic)
```

## Working style

- Reply in caveman lite style. Short, plain.
- Work phase by phase. One commit per phase. See `.claude/rules/git.md`.
- A business rule that is not in `docs/spec.md` is not decided. Ask, then write it there.
