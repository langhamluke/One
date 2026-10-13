import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import Stripe from 'stripe';
import { createApp } from '../src/app.ts';
import type { Config } from '../src/config.ts';
import { InMemoryRentalStore, type Rental } from '../src/store.ts';

const WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';
const config: Config = {
  stripeSecretKey: 'sk_test_unused',
  stripeWebhookSecret: WEBHOOK_SECRET,
  publicBaseUrl: 'https://slopecycleski.com',
  shipToCountries: ['US'],
  requireTermsOfService: false,
  port: 0,
};

function fakeSession(paymentStatus: Stripe.Checkout.Session.PaymentStatus) {
  return {
    id: 'cs_test_abc123',
    object: 'checkout.session',
    payment_status: paymentStatus,
    customer: 'cus_123',
    payment_intent: { id: 'pi_123', payment_method: 'pm_123' },
    customer_details: { email: 'parent@example.com' },
    amount_total: 37800,
    currency: 'usd',
    metadata: { season: '2026-27', children: JSON.stringify([['season_full_kit_2026-27', '5–8', '7']]) },
  };
}

async function withServer(paymentStatus: Stripe.Checkout.Session.PaymentStatus) {
  const stripe = new Stripe('sk_test_unused');
  const state = { paymentStatus };
  // Only the network call is faked; signature verification is the real SDK code.
  (stripe.checkout.sessions as unknown as { retrieve: unknown }).retrieve = async () => fakeSession(state.paymentStatus);

  const store = new InMemoryRentalStore();
  const paid: Rental[] = [];
  const failed: Rental[] = [];
  const app = createApp({
    stripe,
    config,
    store,
    onRentalPaid: async (r) => void paid.push(r),
    onRentalPaymentFailed: async (r) => void failed.push(r),
  });
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  async function send(type: string, signature?: string) {
    const payload = JSON.stringify({
      id: `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type,
      data: { object: { id: 'cs_test_abc123', object: 'checkout.session' } },
    });
    const header = signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return fetch(`http://localhost:${port}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: payload,
    });
  }

  return { send, store, paid, failed, state, close: () => server.close() };
}

test('rejects events with a bad signature', async () => {
  const s = await withServer('paid');
  try {
    const res = await s.send('checkout.session.completed', 't=1,v1=deadbeef');
    assert.equal(res.status, 400);
    assert.equal(s.paid.length, 0);
  } finally {
    s.close();
  }
});

test('fulfils a paid session exactly once across duplicate deliveries', async () => {
  const s = await withServer('paid');
  try {
    assert.equal((await s.send('checkout.session.completed')).status, 200);
    assert.equal((await s.send('checkout.session.completed')).status, 200);
    assert.equal(s.paid.length, 1);
    const rental = await s.store.get('cs_test_abc123');
    assert.equal(rental?.status, 'paid');
    assert.equal(rental?.paymentMethodId, 'pm_123');
    assert.equal(rental?.customerId, 'cus_123');
    assert.deepEqual(rental?.children, [{ packageLookupKey: 'season_full_kit_2026-27', ageBracket: '5–8', size: '7' }]);
  } finally {
    s.close();
  }
});

test('waits for delayed payment methods before fulfilling', async () => {
  const s = await withServer('unpaid');
  try {
    await s.send('checkout.session.completed');
    assert.equal(s.paid.length, 0);
    assert.equal((await s.store.get('cs_test_abc123'))?.status, 'awaiting_payment');

    s.state.paymentStatus = 'paid';
    await s.send('checkout.session.async_payment_succeeded');
    assert.equal(s.paid.length, 1);
  } finally {
    s.close();
  }
});

test('records a failed delayed payment without fulfilling', async () => {
  const s = await withServer('unpaid');
  try {
    await s.send('checkout.session.completed');
    await s.send('checkout.session.async_payment_failed');
    assert.equal(s.paid.length, 0);
    assert.equal(s.failed.length, 1);
    assert.equal((await s.store.get('cs_test_abc123'))?.status, 'payment_failed');
  } finally {
    s.close();
  }
});

test('ignores unrelated event types', async () => {
  const s = await withServer('paid');
  try {
    assert.equal((await s.send('customer.created')).status, 200);
    assert.equal(await s.store.get('cs_test_abc123'), undefined);
  } finally {
    s.close();
  }
});
