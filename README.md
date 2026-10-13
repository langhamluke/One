# Slopecycle payments

Stripe Payments for [slopecycleski.com](https://slopecycleski.com) seasonal kids' ski apparel rentals: Stripe Checkout, verified webhooks, and saved-card damage and late fees.

See [docs/STRIPE_INTEGRATION_PLAN.md](docs/STRIPE_INTEGRATION_PLAN.md) for the design, the key permissions, and the go-live checklist.

## Quick start (sandbox)

```sh
npm install
npm run hooks:install          # blocks commits containing Stripe keys
cp .env.example .env           # fill in a sandbox restricted key (rk_test_...)
npm run seed:catalog -- season_jacket_pants_2026-27=<cents> season_full_kit_2026-27=<cents>
stripe listen --forward-to localhost:4242/webhooks/stripe   # copy whsec_ into .env
npm run dev
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/checkout` | `{ children: [{ packageLookupKey, ageBracket, size }] }` → `{ url }`. Redirect the browser to `url`. |
| `GET /api/checkout/:sessionId` | Status for the confirmation page (display only). |
| `POST /webhooks/stripe` | Stripe events. Fulfillment happens here. |

From the storefront:

```js
const res = await fetch('https://<payments-host>/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ children: [{ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: '7' }] }),
});
const { url, error } = await res.json();
if (url) window.location.href = url;
```

## Checks

```sh
npm run typecheck
npm test
```
