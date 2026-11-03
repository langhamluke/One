# Base Case Privacy Policy (DRAFT — for attorney review before publication)

**Effective date:** [to be set at launch]  
**Operator:** [Legal entity name], Colorado ("we", "us")  
**Contact:** [privacy@yourdomain] · [mailing address]

> Draft status: this policy was prepared as a working draft on 2026-11-03. It must be reviewed by counsel
> licensed in Colorado and, if Base Case is offered through a registered investment adviser, by that adviser's
> chief compliance officer, before it is published or relied on.

## 1. What Base Case is
Base Case is a financial-planning workspace. A person (a "Client") enters information about their career, income,
spending, debts, benefits and goals. The software produces hypothetical projections and educational action items.
A planner ("Advisor") can review, edit and approve a Client's plan. An "Administrator" manages accounts.

Base Case is **not** a bank, broker-dealer, or investment adviser, and the software does not provide individualized
investment, tax, or legal advice. Where an investment adviser uses Base Case with its clients, that adviser is the
party responsible for advice, and its own privacy notice (for example, a notice required by SEC Regulation S-P)
also applies.

## 2. Information we collect
We collect only what the planning model needs:
- **Account data:** email address, display name (we ask for a first name or nickname only), role, password hash,
  optional two-factor authentication secret (encrypted).
- **Plan data you enter:** age, state and metro of residence, household details (number of dependents, whether there
  is a second income), income and career choices, spending, balances, debts (type, balance, rate, plan), employer
  benefits, goals, insurance status, risk-questionnaire answers, free-text notes.
- **Assistant conversations:** questions you ask the in-app assistant and the answers it gives.
- **Technical data:** IP address, browser user agent, timestamps, and an audit trail of actions taken in the
  application (who viewed or changed what, and when).

**What we ask you not to enter:** Social Security numbers, dates of birth, account numbers, lender names,
government ID numbers, health information, or the full legal names of other people. Fields are labelled to
discourage this, and we will delete such data on request.

## 3. How we use information
- To run the planning model and show you your projections.
- To let your assigned Advisor review and approve changes to your plan (if you have one).
- To answer your questions in the in-app assistant **about your own plan only**.
- To keep the service secure (authentication, rate limiting, audit logging, incident response).
- To comply with law and with the record-keeping obligations of any investment adviser that uses the service.

We do **not** sell personal information, use it for advertising, or train machine-learning models on it.

## 4. The in-app assistant and service providers
When the assistant feature is enabled, the text of your question and a summary of **your own** plan are sent to
Anthropic, PBC's Claude API to generate an answer. Under Anthropic's commercial terms, API inputs and outputs are
not used to train Anthropic's models; retention is governed by Anthropic's data-retention policy for the API
(30 days by default for trust-and-safety purposes unless a zero-data-retention agreement applies).
No other client's data, no credentials, and no secrets are ever included in these requests.
The assistant has no web access and cannot look up information outside your plan and the application's cited data.

Other providers we may use: hosting and database infrastructure (e.g., a cloud host and a managed PostgreSQL
service), and, if enabled, an email delivery provider for invitations. Each provider processes data only on our
instructions under a written agreement.

## 5. How we protect information
- Encryption in transit (TLS) and at rest. Plan data, assistant conversations and two-factor secrets are
  additionally encrypted at the application layer with AES-256-GCM before being stored, so a copy of the
  database alone does not reveal them.
- Role-based access control: Clients see only their own plan; Advisors see only clients assigned to them;
  Administrators' actions are logged.
- Passwords are hashed with scrypt; optional time-based one-time passcodes (TOTP) for two-factor authentication;
  login rate limiting and account lockout.
- An append-only audit log records access to client plans.
- Secure session cookies (HttpOnly, SameSite, Secure) and anti-CSRF checks.
- Security details are described in `docs/SECURITY.md`.

## 6. Data retention and deletion
Plan data is kept while your account is active. When an Advisor's firm uses Base Case, applicable record-keeping
rules (for example, SEC Rule 204-2 for registered investment advisers) may require the firm to retain records for
at least five years; in that case we retain the records for the period the firm instructs. You may request deletion
of your account and plan data at any time by contacting us; we will delete it within 30 days unless the law or a
firm's retention obligation requires otherwise, in which case we will tell you.

## 7. Your choices and rights
- You can view and correct your plan data at any time in the application, and export it as a JSON file.
- You can ask us to delete your data (Section 6).
- Colorado residents: the Colorado Privacy Act gives certain consumers rights of access, correction, deletion and
  portability; data governed by the Gramm-Leach-Bliley Act and SEC Regulation S-P is generally exempt from that
  Act, but we honor these requests as a matter of policy regardless of whether the Act applies.
- We do not process data of children under 16 and do not knowingly collect it.

## 8. Security incidents
If we become aware of unauthorized access to or use of your information, we will investigate promptly, notify
any investment adviser whose clients are affected within 72 hours of becoming aware (consistent with the
service-provider oversight provisions of SEC Regulation S-P), and notify affected individuals as required by law
(including the Colorado Security Breach Notification law and, where applicable, Regulation S-P's 30-day customer
notice requirement).

## 9. Changes
We will post changes to this policy here with a new effective date and, for material changes, notify active users
by email or in-app notice.

## 10. Contact
[privacy@yourdomain] · [mailing address]

---
### Attorney review checklist (remove before publishing)
- [ ] Confirm the operating entity and whether Base Case is offered by an RIA (then Reg S-P initial/annual
      privacy notices and Form ADV disclosures apply to the firm) or by an unaffiliated software vendor.
- [ ] Confirm Anthropic API data-retention terms in force at launch and whether a zero-data-retention agreement is needed.
- [ ] Confirm state breach-notification obligations for each state where clients reside.
- [ ] Confirm retention periods required by the firm (Rule 204-2: five years, first two in an easily accessible place).
- [ ] Add Terms of Use and an investment-analysis-tool disclosure (see docs/COMPLIANCE_NOTES.md).
