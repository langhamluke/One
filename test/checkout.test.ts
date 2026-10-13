import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CartError, INTEGRATION_IDENTIFIER, buildSessionParams, parseCart, resolvePrices } from '../src/checkout.ts';

const config = { publicBaseUrl: 'https://slopecycleski.com', shipToCountries: ['US'], requireTermsOfService: false };
const prices = new Map([
  ['season_jacket_pants_2026-27', 'price_jp'],
  ['season_full_kit_2026-27', 'price_fk'],
]);

test('parseCart accepts valid children and rejects tampering', () => {
  const cart = parseCart({
    children: [{ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: '7/8' }],
  });
  assert.deepEqual(cart, [{ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: '7/8' }]);

  assert.throws(() => parseCart({ children: [] }), CartError);
  assert.throws(() => parseCart({ children: [{ packageLookupKey: 'price_123', ageBracket: '5–8', size: 'M' }] }), CartError);
  assert.throws(() => parseCart({ children: [{ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '99', size: 'M' }] }), CartError);
  assert.throws(() => parseCart({ children: Array(6).fill({ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: 'M' }) }), CartError);
});

test('buildSessionParams follows Stripe best practices for this flow', () => {
  const params = buildSessionParams(
    [
      { packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: '7' },
      { packageLookupKey: 'season_full_kit_2026-27', ageBracket: '9–12', size: '10' },
      { packageLookupKey: 'season_jacket_pants_2026-27', ageBracket: '2–4', size: '4T' },
    ],
    prices,
    config,
  );

  assert.equal(params.mode, 'payment');
  assert.deepEqual(params.line_items, [
    { price: 'price_fk', quantity: 2 },
    { price: 'price_jp', quantity: 1 },
  ]);
  assert.equal('payment_method_types' in params, false, 'dynamic payment methods: never pass payment_method_types');
  assert.equal(params.payment_intent_data?.setup_future_usage, 'off_session');
  assert.equal(params.customer_creation, 'always');
  assert.equal(params.integration_identifier, INTEGRATION_IDENTIFIER);
  assert.match(INTEGRATION_IDENTIFIER, /_[a-z]{8}$/);
  assert.deepEqual(params.shipping_address_collection, { allowed_countries: ['US'] });
  assert.equal(params.consent_collection, undefined);
  assert.equal(params.success_url, 'https://slopecycleski.com/rental/confirmed?session_id={CHECKOUT_SESSION_ID}');
  assert.ok((params.metadata?.children as string).length <= 500);
});

test('buildSessionParams omits shipping when gear is picked up and adds ToS when enabled', () => {
  const params = buildSessionParams(
    [{ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: '7' }],
    prices,
    { ...config, shipToCountries: [], requireTermsOfService: true },
  );
  assert.equal(params.shipping_address_collection, undefined);
  assert.deepEqual(params.consent_collection, { terms_of_service: 'required' });
});

test('resolvePrices fails loudly when a lookup key has no active price', async () => {
  const stripe = {
    prices: { list: async () => ({ data: [{ id: 'price_fk', lookup_key: 'season_full_kit_2026-27' }] }) },
  } as never;
  const found = await resolvePrices(stripe, ['season_full_kit_2026-27', 'season_full_kit_2026-27']);
  assert.equal(found.get('season_full_kit_2026-27'), 'price_fk');
  await assert.rejects(resolvePrices(stripe, ['season_jacket_pants_2026-27']), /No active Stripe Price/);
});
