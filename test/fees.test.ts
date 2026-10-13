import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chargeRentalFee } from '../src/fees.ts';
import type { Rental } from '../src/store.ts';

const rental: Rental = {
  checkoutSessionId: 'cs_test_abc123',
  status: 'paid',
  season: '2026-27',
  customerId: 'cus_123',
  paymentIntentId: 'pi_123',
  paymentMethodId: 'pm_123',
  email: 'parent@example.com',
  amountTotal: 37800,
  currency: 'usd',
  children: [],
  updatedAt: new Date().toISOString(),
};

test('charges the saved card off-session with an idempotency key', async () => {
  const calls: { params: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const stripe = {
    paymentIntents: {
      create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
        calls.push({ params, options });
        return { id: 'pi_fee', status: 'succeeded' };
      },
    },
  } as never;

  const result = await chargeRentalFee(stripe, rental, { feeId: 'late-2027-04-20', amount: 2500, reason: 'late return' });
  assert.deepEqual(result, { status: 'succeeded', paymentIntentId: 'pi_fee' });
  assert.equal(calls[0]?.params.off_session, true);
  assert.equal(calls[0]?.params.confirm, true);
  assert.equal(calls[0]?.params.payment_method, 'pm_123');
  assert.equal('payment_method_types' in (calls[0]?.params ?? {}), false);
  assert.equal(calls[0]?.options.idempotencyKey, 'rental-fee:cs_test_abc123:late-2027-04-20');
});

test('reports when the customer must authenticate instead of throwing', async () => {
  const stripe = {
    paymentIntents: {
      create: async () => {
        throw Object.assign(new Error('auth'), {
          type: 'StripeCardError',
          code: 'authentication_required',
          raw: { payment_intent: { id: 'pi_fee' } },
        });
      },
    },
  } as never;
  const result = await chargeRentalFee(stripe, rental, { feeId: 'damage-1', amount: 4000, reason: 'torn jacket' });
  assert.equal(result.status, 'requires_customer_action');
  assert.equal(result.paymentIntentId, 'pi_fee');
});

test('refuses to charge an unpaid rental or a bad amount', async () => {
  const stripe = { paymentIntents: { create: async () => assert.fail('should not call Stripe') } } as never;
  await assert.rejects(chargeRentalFee(stripe, { ...rental, status: 'awaiting_payment' }, { feeId: 'x', amount: 100, reason: 'x' }));
  await assert.rejects(chargeRentalFee(stripe, rental, { feeId: 'x', amount: 12.5, reason: 'x' }));
});
