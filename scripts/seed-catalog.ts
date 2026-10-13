// Creates or updates the Stripe Products and Prices for the rental catalog.
// Safe to re-run. Pass each package's season price in cents:
//
//   npm run seed:catalog -- season_jacket_pants_2026-27=12900 season_full_kit_2026-27=18900
//
// Changing an amount creates a new Price, moves the lookup key to it, and
// archives the old Price (Stripe Prices are immutable).
import Stripe from 'stripe';
import { PACKAGES } from '../src/catalog.ts';
import { getStripe } from '../src/stripe.ts';

const CURRENCY = 'usd';

const amounts = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, cents] = arg.split('=');
    const amount = Number(cents);
    if (!key || !Number.isInteger(amount) || amount <= 0) throw new Error(`Bad argument "${arg}", expected lookup_key=cents`);
    return [key, amount] as const;
  }),
);

const unknown = [...amounts.keys()].filter((k) => !PACKAGES.some((p) => p.lookupKey === k));
if (unknown.length) throw new Error(`Unknown lookup key(s): ${unknown.join(', ')}`);

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
const stripe = getStripe(key);

for (const pkg of PACKAGES) {
  const amount = amounts.get(pkg.lookupKey);
  if (amount === undefined) {
    console.log(`skip   ${pkg.lookupKey} (no amount given)`);
    continue;
  }

  const productId = `slopecycle_${pkg.lookupKey}`.replace(/[^A-Za-z0-9_-]/g, '_');
  try {
    await stripe.products.update(productId, { name: pkg.name, description: pkg.description, active: true });
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeInvalidRequestError) || err.code !== 'resource_missing') throw err;
    await stripe.products.create({ id: productId, name: pkg.name, description: pkg.description });
  }

  const existing = (await stripe.prices.list({ lookup_keys: [pkg.lookupKey], active: true, limit: 1 })).data[0];
  if (existing && existing.unit_amount === amount && existing.currency === CURRENCY && existing.product === productId) {
    console.log(`ok     ${pkg.lookupKey} = ${amount} ${CURRENCY} (${existing.id})`);
    continue;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: amount,
    lookup_key: pkg.lookupKey,
    transfer_lookup_key: true,
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  console.log(`set    ${pkg.lookupKey} = ${amount} ${CURRENCY} (${price.id})`);
}
