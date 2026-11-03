# Questions for you, and what I need from you

Prepared 2026-11-03 with the first full build of Base Case. Nothing here blocks using the demo; each item
unlocks the next level of fidelity.

## A. Questions (answer in any order)

1. **Flight Plan source code.** The handoff says to copy the exact FNCE 2830 question and option text from
   `src/data/questionnaire.ts`. That file was not in this repository, so the questionnaire ships with a
   structurally identical stand-in (same point values, same scoring) flagged "text not verified". Where is Flight
   Plan's code (a GitHub repo I can be given access to, or paste the file)?
2. **Who operates Base Case?** (a) You, for yourself and friends; (b) MCIA, licensing it from you; (c) both.
   This decides the privacy policy's legal entity, whether SEC Regulation S-P applies to the deployment, and the
   wording of disclaimers. The draft policy assumes (c) and is marked for attorney review.
3. **Deployment.** Do you want it hosted now (Railway, Render or Fly for the app; Neon or Supabase for
   PostgreSQL — all have free tiers) under a domain you own, or demoed from a laptop? If hosted, which provider
   accounts do you have?
4. **Assistant model and budget.** The in-app assistant uses the Anthropic API. Default model is Claude Opus 5.5
   ($4 per million input tokens, $20 per million output). A typical question costs well under $0.05. Do you want
   a cheaper model (Sonnet 5.5) or a monthly cap? Without a key the assistant runs in a deterministic "offline
   explainer" mode, which is what the demo uses today.
5. **"Flowcast" and "S-blocks / Helix".** You referenced Flowcast as the model for login-protected safety, and
   S-blocks and Helix as brokerage/tool examples. I could not identify these with confidence. Can you describe them
   or link to them so the Playbook's tool guidance and the assistant's safety model match what you have in mind?
6. **Occupations and metros for the demo.** The data pass covers the common graduate occupations and ~20 metros.
   Which occupations will your friends and MCIA's prospects actually be in? I will prioritise those for
   metro-specific wage data.
7. **Look and feel.** The build uses a light "paper and ink" model-desk design with one violet accent for the
   recommended path (see docs/DESIGN.md). If you want a dark theme or a different accent, say so now — the tokens
   are centralised and cheap to change.
8. **Data verification.** Several figures are flagged unverified because this environment could not open
   irs.gov, ssa.gov, bls.gov, studentaid.gov or taxfoundation.org. See `shared/data/sources.md` → "could not
   verify". If you allow those domains in the session's network settings, I can verify them directly next time.
9. **Advisor workflow.** Should advisors be able to edit a client's approved plan directly (currently yes, logged
   as a new version), or must every change go through a proposal?
10. **Retention.** How long should client plans, proposals and chats be kept after an account is closed?
    (RIA books-and-records rules suggest five years; a personal deployment can be shorter.)

## B. Resources to provide or install

| Item | Why | How |
|---|---|---|
| Node.js 22 LTS + npm | Run the app locally | https://nodejs.org (LTS) |
| Git + GitHub access to `langhamluke/One` | Pull the code | Already in place |
| Anthropic API key (optional) | Enables the Claude-powered assistant | console.anthropic.com → API keys → set `ANTHROPIC_API_KEY` |
| Hosting account (optional) | Public demo URL for MCIA | Railway / Render / Fly.io |
| PostgreSQL (optional for hosting) | Durable production database | Neon or Supabase free tier → `DATABASE_URL` |
| Email provider (optional) | Send invitations and password resets automatically | Resend / Postmark; not wired yet |
| BLS API key (optional, free) | Automate annual wage refresh | https://data.bls.gov/registrationEngine/ |
| Network allow-list for future Claude sessions | Direct primary-source verification | bls.gov, api.bls.gov, irs.gov, ssa.gov, studentaid.gov, federalregister.gov, taxfoundation.org, congress.gov, onetonline.org |
| Flight Plan repository | Exact questionnaire text; airline data for continuity | Share the repo or the file |
| Attorney review | Privacy policy and terms before any real client data | docs/PRIVACY_POLICY.md checklist |

## C. What is intentionally not in this build
- Live data feeds (the app ships cited, dated datasets; a refresh procedure is documented).
- Account aggregation (Plaid etc.), trading, or any product recommendations by brand.
- Self-service password reset by email (admin-issued reset links instead) until an email provider is connected.
- Multi-firm tenancy (one firm per deployment).
