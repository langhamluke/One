# 0001: Move Sprout to Next.js 16

**Status:** Built
**Author:** Claude Code (bootstrapped before the architect role existed)
**Builder branch:** `claude/focused-sagan-nxuext`

## Problem

Sprout was a single-page Vite app with no server. Logins (Supabase), reminder emails (Resend) and scheduled jobs all need server code, and the chosen stack is Next.js on Vercel.

## Goal

The same app, unchanged for students, running on Next.js 16 with real page URLs, ready for Supabase next.

## Scope

- In: framework move, real routes (`/learn` instead of `/#/learn`), self-hosted fonts via `next/font`, CI on every pull request, shared agent rules.
- Out: logins, a database, emails, deployment settings (the human connects Vercel).

## Design

- `src/app/layout.tsx` loads fonts and wraps every page in `src/app/shell.tsx` (navigation and onboarding gate).
- Each route's `page.tsx` renders a view from `src/views/`.
- Data stays in localStorage for now, so the shell renders only in the browser to avoid server/client mismatches.

## Acceptance criteria

- [x] Every screen loads from its own URL and from the navigation
- [x] Saved data survives a page reload
- [x] All existing tests pass; typecheck and build pass in CI
- [x] No console or page errors when walking through every screen

## Open questions

- When Supabase lands, data moves from localStorage to the database. Spec 0002 should cover migrating existing on-device data.
