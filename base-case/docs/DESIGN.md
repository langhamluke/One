# Base Case — Design System ("The Model Desk")

Palette (applied 2026-11-08): cool gray #E2E3E5 page with #B4B7BB hairlines, deep green #174D38 as the brand / recommended-path color, rich brown #4D1717 for genuine problems, steel blue #2E5E86 for anything editable. Asset classes use muted greens and tans.

Base Case is the planning tool a sharp friend who works in finance would build for you: a clean,
well-set financial model, not a bank brochure and not a game. The metaphor is **the model desk** —
paper, ink, hairline rules, tabular numbers, one deep-green accent for the *base case* (the recommended path).

## Principles
1. **One meaning per color.** Never reuse a semantic color for decoration.
2. **Numbers are the product.** Every number is set in IBM Plex Mono with tabular figures. Big readouts are
   quiet (medium weight), labels are small caps-ish (11px, letter-spacing 0.06em, ink-3).
3. **Restraint.** No gradients on content, no glassmorphism, no emoji, no confetti, no sound. Motion is
   limited to charts drawing in (≤ 600 ms) and panels fading (≤ 150 ms); all disabled under `prefers-reduced-motion`.
4. **Light, paper surface.** `paper` #E2E3E5 page, `paper-2` #FFFFFF cards, `line` #B4B7BB 1px borders,
   10px radius, shadow-card only. Page background carries a faint 24px grid (blueprint nod, 3% ink).
5. **Accessible.** WCAG AA contrast everywhere (ink on paper ≥ 12:1; semantic colors on white ≥ 4.5:1 for text).
   Everything keyboard reachable with visible focus rings (2px `edit` outline, 2px offset). Works at 1440, 1024 and 768 px.

## Color language (Tailwind tokens in tailwind.config.js)
| Token | Hex | Meaning | Use |
|---|---|---|---|
| `edit` | #2E5E86 | **Editable** | input borders on focus, slider thumbs, "edit" affordances, links |
| `rec` | #174D38 | **Recommended / base case** | median line, model allocation ring, active path, targets |
| `ok` | #2B7A4B | **On track** | success chips, positive deltas |
| `warn` | #B5740A | **Caution / unverified** | VERIFY tags, caution alerts, provisional profile badge |
| `danger` | #4D1717 | **Genuine problem** | warnings (shortfall, negative cash flow). Nothing else. |
| `ink`/`ink-2/3/4` | #1A1A1A… | Text hierarchy | primary / secondary / labels / disabled |
| `asset.*` | muted blues & tans | Asset classes | donut and glide chart only |

Comparison paths (CAREER screen) use a neutral ordinal palette distinct from semantics:
path 1 = ink (#1A1A1A), path 2 = rec (#174D38), path 3 = #0F6E6E (teal), path 4 = #8A5A2B (rust).
The *active* path is always drawn in `rec`; other paths take their ordinal color.

## Typography
- UI: IBM Plex Sans (400/500/600). Body 14px/20px. Headings 600 weight, tight tracking.
- Numbers: IBM Plex Mono (400/500), `font-variant-numeric: tabular-nums`.
- Readout: 28px mono medium; label above in 11px uppercase ink-3 tracking-wider.

## Signature components
1. **Readout strip** (sticky top of planning screens): Net worth · Savings rate · P(success) · Retirement income (P50, today's $) · Emergency fund months · Debt-free age. Values mono; deltas vs approved plan shown in ok/danger when viewing a draft.
2. **Phase stepper**: PROFILE → RISK → CAREER → PLAN → FUTURE → SUMMARY (Flight Plan: PREFLIGHT → CHECKLIST → FLIGHT PLAN → CRUISE → LANDING → BRIEFING; same routes, same component). Current phase underlined in `rec`; completed phases get a small check; keyboard arrows move between phases. Flight Plan wears the **cockpit theme** instead: the same components and tokens, re-coloured by `:root[data-product='flight-plan']` in `src/styles/index.css` (B612 / B612 Mono, bg #0B0F14, panel #121821, edge #243042, cyan #4FD1FF = editable, magenta #FF4FD8 = the flight plan, amber #FFB020 = caution, red #FF4D4D = warning), with the original's top header, six-readout strip, numbered phase tabs with hints, EICAS alert stack, attitude indicator and previous/next phase buttons. Sprout wears its own theme the same way (`:root[data-product='sprout']`: warm off-white #f5f4ef or, under `prefers-color-scheme: dark`, near-black #0d1110; deep green #1e4d3b = editable, brass #9c7a43 = recommended; Instrument Serif for h1 and readout values, Geist for everything else; 14px card radius, pill buttons; the stepper shows each phase's hint). Every colour in the app is a CSS variable (`--c-*`, R G B triples) read by Tailwind and by the charts (`theme` in `src/components/charts/common.tsx`); never hard-code a hex in a component.
3. **Scenario cone** (FUTURE): area between P10 and P90 in rec at 12% opacity, P25–P75 not shown, P50 as 2px rec line, deterministic as dashed ink-4, retirement age vertical rule with boxed readout. Y axis in today's $ by default.
4. **Career ladder comparison** (CAREER): horizontal timeline per path, rungs as small squares at promotions with labels using greedy lane assignment to avoid overlap; salary curve beneath; selectable 2–4 paths.
5. **Playbook** (PLAN): numbered order of operations list — each step shows status chip (Done / Next / Later) and dollar amount.
6. **Alert ledger**: three sections (Warning → Caution → Advisory), each row with a 6px color bar on the left, title, one-line detail; advisor-only rows show a small "ADVISOR" tag.
7. **VERIFY tag**: 10px uppercase warn chip next to any unverified/self-reported number in Advisor mode; hover/focus shows source + as-of.
8. **Draft banner**: when editing a proposal, a thin rec-colored bar across the top: "Draft — changes are provisional until approved" with Submit for review button.

## Layout
- App shell: left rail 232px (role nav) on ≥1024; collapses to top bar at 768. Content max-width 1280, 24px gutters.
- Planning screens: two-column at ≥1024 (inputs 5/12, results 7/12), stacked at 768.
- Print (SUMMARY): light theme, Letter, `@page { size: letter; margin: 0.45in }`, `.no-print` hidden, fits ONE page.

## Copy voice
Direct, plain English, second person. No exclamation marks. Explain every number in one sentence when hovered.
Disclaimers are present but not shouted (ink-3, 12px).
