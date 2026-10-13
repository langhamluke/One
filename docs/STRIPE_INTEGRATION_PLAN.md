# Slopecycle × Stripe integration plan

**Business:** slopecycleski.com, seasonal rentals of kids' ski apparel
**Stripe products:** Payments
**Stack in this repo:** Node 20+, TypeScript, Express, `stripe@23.0.0` (pins API version `2026-09-30.endive`)

> This plan follows the Stripe plugin's `stripe-best-practices` guidance. The
> `stripe_implementation_planner` MCP tool couldn't be reached from the build
> environment (network policy blocked `*.stripe.com`). If you run the planner
> yourself, compare its output against the decisions below.

## 1. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Payment API | **Checkout Sessions**, `mode: 'payment'`, Stripe-hosted page | Recommended surface for one-time web payments. Stripe handles the payment UI, wallets (Apple Pay, Google Pay, Link), SCA/3DS and promo codes. |
| Pricing model | One-time payment per child per season | A season rental is a single purchase. If you later add monthly plans, move to Billing (subscriptions). |
| Catalog | One Product + Price per package, addressed by **lookup key** (`season_full_kit_2026-27`) | You can change prices without deploying. Size and age bracket go in metadata, not separate Prices. |
| Payment methods | **Dynamic payment methods**: `payment_method_types` is never passed | Manage which methods appear in Dashboard → Settings → Payment methods. |
| Damage and late fees | Save the card at checkout (`setup_future_usage: 'off_session'`, `customer_creation: 'always'`). Charge later with an off-session PaymentIntent. | Card authorizations expire after about 7 days, so a "deposit hold" can't cover a whole season. The saved card plus disclosed terms can. |
| Fulfillment | **Webhooks only**: `checkout.session.completed`, `…async_payment_succeeded`, `…async_payment_failed` | Customers don't always reach the success page. Fulfill only when `payment_status` is `paid`. |
| Keys | **Restricted API key** (`rk_`) per environment, stored in a secrets vault | Least privilege. Keys never go in code, and a pre-commit hook blocks them. |
| Environments | A separate **Stripe sandbox** for development and CI, then live mode | Keeps test data and settings separate from live mode. |
| Tracking | `integration_identifier: slopecycle_season_rental_qhzmvtrk` | Lets you compare this checkout flow in the Dashboard. |

## 2. Checkout flow

1. The storefront sends `POST /api/checkout` with `{ children: [{ packageLookupKey, ageBracket, size }] }`.
2. The server validates the cart against the catalog and resolves Prices by lookup key. The client never sends amounts or Price IDs.
3. The server creates a Checkout Session and returns `{ url }`. The browser redirects to Stripe.
4. The customer pays. Stripe collects their email, phone and shipping address (if `SHIP_TO_COUNTRIES` is set), saves the card, and shows the saved-card disclosure.
5. Stripe sends a webhook to `POST /webhooks/stripe`. The server verifies the signature, re-fetches the session, stores the rental (customer, payment method, children), and calls `onRentalPaid` once.
6. The success page calls `GET /api/checkout/:sessionId` for display only.

## 3. Damage and late fees

`chargeRentalFee(stripe, rental, { feeId, amount, reason })` charges the saved card off-session with an idempotency key. If the bank asks for authentication, or the card is declined, it returns `requires_customer_action`. In that case, email the customer a payment link instead of retrying.

Before charging any fee:
- Publish rental terms that state the fees. Add the Terms of Service URL in Dashboard → Settings → Public details, then set `REQUIRE_TERMS_OF_SERVICE=true` so Checkout requires agreement.
- Notify the customer before you charge.
- Expect disputes when fees surprise customers. Keep check-in photos and return logs as evidence.

## 4. Restricted key permissions

| Key | Used by | Permissions |
| --- | --- | --- |
| `slopecycle-payments` | the server | Checkout Sessions: **write** · Prices: **read** · PaymentIntents: **write** (fees) |
| `slopecycle-catalog-admin` | `npm run seed:catalog` only | Products: **write** · Prices: **write** |

If a call returns `403`, add only the permission it names. Watch calls with `stripe logs tail`.

## 5. Sales tax (out of scope, but decide deliberately)

You chose Payments only, so this integration does **not** calculate or collect sales tax. Many US states tax rentals of tangible goods, and children's clothing exemptions may not apply to rentals. Ask your tax advisor whether you need to collect tax. If you do, add Stripe Tax later: set a head office address, add registrations, assign a product tax code, and set `automatic_tax: { enabled: true }` on the session.

## 6. Build and test checklist (sandbox)

- [ ] Create a sandbox. Create the two restricted keys above in it.
- [ ] Copy `.env.example` to `.env` and fill it in.
- [ ] `npm run seed:catalog -- season_jacket_pants_2026-27=<cents> season_full_kit_2026-27=<cents>`
- [ ] `stripe listen --forward-to localhost:4242/webhooks/stripe` and put the printed `whsec_` in `.env`.
- [ ] `npm run dev`, then pay with test cards: `4242 4242 4242 4242` (success), `4000 0025 0000 3155` (3DS), `4000 0000 0000 9995` (decline).
- [ ] Confirm a rental is stored only after the webhook arrives.
- [ ] Call `chargeRentalFee` against a test rental. Test `4000 0027 6000 3184` to see the authentication-required path.
- [ ] `npm test && npm run typecheck`

## 7. Go-live checklist

- [ ] Create live restricted keys and store them in the host's secrets vault. Set an IP access policy on each key.
- [ ] Create a live webhook endpoint `https://<payments-host>/webhooks/stripe` subscribed to the three `checkout.session.*` events. Use its own `whsec_`.
- [ ] Re-run `seed:catalog` against live mode.
- [ ] Turn on the payment methods you want in live mode. Set the statement descriptor (for example `SLOPECYCLE`), the support email and phone, and the ToS URL.
- [ ] Replace `InMemoryRentalStore` with persistent storage (for example a Base44 `Rental` entity).
- [ ] Implement `onRentalPaid` (confirmation email, gear reservation) and `onRentalPaymentFailed`.
- [ ] Turn on Dashboard 2FA with passkeys or an authenticator app, not SMS.
- [ ] Review https://docs.stripe.com/get-started/checklist/go-live

## 8. Later improvements

- Handle `charge.dispute.created` (alert yourself and gather evidence) and `charge.refunded` (sync rental status).
- Use Customer portal or saved-customer checkout for returning families next season.
- Offer an early-bird price for next season by moving its lookup key with `transfer_lookup_key`.
