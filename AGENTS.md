# Sprout: rules for AI agents

Shared instructions for every agent working in this repo (Antigravity, Claude Code, and any other). `CLAUDE.md` and `.agent/rules/` point here, so this file is the single source of truth. Edit only this one.

## What Sprout is

A free financial-literacy app for high school and college students: lessons, savings goals, a pay-yourself-first plan, weekly check-ins, portfolio diversification and an optimizer, credit tools, and milestone bonuses that go into savings. Research behind the product decisions lives in `reports/`.

## Stack

Next.js 16 (App Router) + TypeScript, deployed on Vercel. Planned, in this order: Supabase (auth + Postgres), Resend (email), PostHog (analytics), Sentry (errors), Stripe (B2B only), Inngest (only for multi-step jobs).

- `src/app/`: routes. Each `page.tsx` is a thin client wrapper around a view.
- `src/views/`: one screen per file.
- `src/components/ui.tsx`: shared UI pieces and icons.
- `src/lib/`: pure finance and habit logic. No React. Every function here has tests in a `*.test.ts` beside it.
- `src/data/`: lessons, securities catalog, sample data.
- `src/store.ts`: app state (currently saved in the browser via localStorage).
- `src/index.css`: design tokens (colors, fonts) and styles. Use the tokens, never hard-coded colors.

Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.

## Roles and workflow

| Agent | Does | Does not |
|---|---|---|
| **Antigravity** (architect) | Writes specs in `specs/`, reviews every pull request against its spec | Write feature code |
| **Claude Code** (builder) | Implements merged specs, writes tests, fixes review findings | Change a spec without the architect, or merge |

1. **Spec first.** Every feature starts as `specs/NNNN-short-name.md`, copied from `specs/TEMPLATE.md` and merged before building starts.
2. **One branch per spec**: `feat/NNNN-short-name`. Never commit directly to `main`, and never work on another agent's branch.
3. **Pull request** using the template. It must link its spec and tick the checklist.
4. **CI must be green**: typecheck, tests, build.
5. **The other agent reviews.** The architect checks the builder's PR against the spec's acceptance criteria. The builder never reviews its own work.
6. **The human merges.** Agents never merge.

Git history and the PR record are the changelog; don't keep a separate one.

## Non-negotiable product rules

- **Never hold or move user money.** Sprout tracks and teaches; banks and credit unions hold funds.
- **Never charge students.** Revenue comes from schools, credit unions, and sponsors.
- **Minors' data:** collect the minimum needed, keep the under-13 block, and never sell or share data or show ads to minors.
- **Every Supabase table has row-level security enabled, with a policy, in the same migration that creates it.** Reviewers reject PRs that add a table without one.
- **Bonuses reward real actions** (saving, automating, check-ins, paying down debt), not quiz answers, and an earned bonus is never taken back.
- **No dark patterns:** no confetti for trades, no nudges toward risky investing, no streak shaming, and cancelling must be as easy as signing up.
- **Automatic transfers we suggest must come with a low-balance warning.**
- Every screen with projections keeps the educational disclaimer.

## Engineering rules

- **Read current docs before using a library.** Use the Context7 documentation tool. Next.js 16 differs from older versions you may have learned (for example, `middleware.ts` is now `proxy.ts`).
- Prefer the simplest thing that works: the standard library, then the platform, then an installed dependency. Add a new dependency only if the spec names it.
- Money math goes in `src/lib/` as pure functions, with tests, including edge cases (zero, negative, empty).
- Keep secrets in environment variables (`.env.local`, Vercel project settings). Never commit them.
- UI copy: plain, specific, no emojis, written for a 16-year-old reader.
