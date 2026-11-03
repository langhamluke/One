# Compliance Notes for Base Case (working notes — not legal advice)

Prepared 2026-11-03 to support a presentation to an SEC-registered investment adviser (RIA). Items marked
**(verify)** should be confirmed by counsel or the firm's chief compliance officer.

## 1. Who is the "adviser"?
Base Case itself is software. **Current status (2026-11-03): operated by Luke Langham personally for himself and friends (deployment model 2).** Model 1 applies if MCIA adopts it.
Two deployment models:
1. **Firm deployment** — the RIA licenses Base Case and its advisors use it with clients. The RIA is the adviser;
   Base Case is a *service provider* under SEC Regulation S-P. The firm's fiduciary duty, Form ADV disclosures,
   marketing rule, and books-and-records rules apply to the firm's use of the tool.
2. **Direct use** (you and friends) — no one is giving advice for compensation; the product must present itself
   as educational and the disclaimer must be visible on every projection and summary.

## 2. SEC Regulation S-P (as amended May 2024; compliance dates Dec 3, 2025 for larger entities, June 3, 2026 for
   smaller entities — i.e., both have passed)
- The RIA must have a written **incident response program** and must **oversee service providers**, including
  contractual provisions that the provider notify the firm **within 72 hours** of becoming aware of a breach of
  customer information. Base Case's privacy policy and security doc commit to that 72-hour notice. **(verify
  contract language)**
- Customer notice of a breach within **30 days** (by the covered institution). Base Case supports this by
  maintaining an audit log and encrypted storage with key custody documentation.
- Safeguards rule: administrative, technical and physical safeguards — see docs/SECURITY.md.

## 3. Marketing Rule (Advisers Act Rule 206(4)-1) — projections and "hypothetical performance"
- Monte Carlo projections and what-if scenarios are *hypothetical performance* under the rule **unless** they are
  produced by an **interactive analysis tool** used by a client/prospect, provided the adviser:
  (A) describes the criteria and methodology, including limitations and key assumptions;
  (B) explains that results may vary with each use and over time;
  (C) if applicable, describes the universe of investments considered and any selectivity; and
  (D) states that the tool generates hypothetical outcomes. (17 CFR 275.206(4)-1(e)(8)(ii)) **(verify)**
- Base Case implements these disclosures: a Methodology & Assumptions panel (A), a "results vary" statement (B),
  generic asset classes only — no products are selected or favored (C), and a hypothetical-outcomes disclaimer on the
  FUTURE and SUMMARY screens (D). Keep these visible and unchanged unless counsel approves.
- Do not use client projections in advertisements.

## 4. Books and records (Rule 204-2)
- Advisers must retain records of recommendations and client communications for five years (first two easily
  accessible). Base Case keeps immutable plan versions, proposal approvals with reviewer identity, and the audit log;
  provide the firm with export capability and retention settings. **(verify retention schedule)**

## 5. Fiduciary duty / suitability
- The risk questionnaire is **educational** (FNCE 2830 adaptation; required footnote shown). The firm's own risk
  assessment process governs recommendations. The model portfolio matrix uses generic asset classes, never products.

## 6. Tax and legal content
- Tax figures are for tax year 2026 (Rev. Proc. 2025-32; IRS Notice 2025-67) and student-loan rules reflect
  P.L. 119-21 effective July 1, 2026. 2027 retirement-plan limits are not yet published (as of 2026-11-03).
- Every figure carries a source and as-of date; unverified figures are flagged. Nothing in the app is a tax
  opinion. Avoid words like "loophole"; describe strategies (backdoor Roth, tax-loss harvesting, §127 employer
  loan repayment) factually with citations.

## 7. Privacy laws
- **GLBA / Reg S-P** governs the RIA's client data. **Colorado Privacy Act** has applicability thresholds
  (100,000 consumers, or 25,000 plus sale of data) and exempts GLBA-covered data; honor access/deletion requests
  anyway. **State breach-notification laws** apply by client residence.
- Data minimization is built in: nickname-only, no SSN/DOB/account numbers, no health data.

## 8. AI assistant
- Scoped to the user's own plan; no tools; no other clients' data; stored encrypted; rate-limited.
- Disclose in the firm's policies that an AI service (Anthropic API) processes plan summaries; consider a
  zero-data-retention agreement for production. **(verify)**
- The assistant must not produce individualized recommendations; its system prompt enforces "explain, don't advise".
  Review a sample of transcripts monthly.

## 9. Accessibility
- WCAG 2.1 AA targets (contrast, keyboard navigation, labels). Not an SEC requirement but increasingly expected.

## 10. Open items before production
- Written service-provider agreement with the firm (security, 72-hour notice, retention, subprocessors).
- Penetration test and dependency audit.
- Email delivery provider for invitations and self-service password reset.
- Replace questionnaire stand-in text with the verified FNCE 2830 text.
- Attorney review of PRIVACY_POLICY.md and a Terms of Use.
