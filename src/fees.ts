import type Stripe from 'stripe';
import type { Rental } from './store.ts';

export interface FeeCharge {
  // Stable ID from your system (e.g. "late-return-2027-04-20") so a retried
  // request never charges twice.
  feeId: string;
  amount: number; // in the smallest currency unit, e.g. cents
  reason: string;
}

export type FeeResult =
  | { status: 'succeeded'; paymentIntentId: string }
  // The bank wants the customer to authenticate; email them a link to pay
  // (for example an invoice or Payment Link) instead of retrying off-session.
  | { status: 'requires_customer_action'; paymentIntentId: string | null; message: string };

// Charges the card saved at checkout for an unreturned-gear or damage fee.
// Only call this under the rental terms the customer agreed to, after
// notifying them.
export async function chargeRentalFee(
  stripe: Pick<Stripe, 'paymentIntents'>,
  rental: Rental,
  fee: FeeCharge,
): Promise<FeeResult> {
  if (rental.status !== 'paid' || !rental.customerId || !rental.paymentMethodId || !rental.currency) {
    throw new Error(`Rental ${rental.checkoutSessionId} has no saved payment method to charge.`);
  }
  if (!Number.isInteger(fee.amount) || fee.amount <= 0) {
    throw new Error('Fee amount must be a positive integer in the smallest currency unit.');
  }

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: fee.amount,
        currency: rental.currency,
        customer: rental.customerId,
        payment_method: rental.paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Slopecycle rental fee: ${fee.reason}`,
        metadata: { checkout_session_id: rental.checkoutSessionId, fee_id: fee.feeId, reason: fee.reason },
      },
      { idempotencyKey: `rental-fee:${rental.checkoutSessionId}:${fee.feeId}` },
    );
    if (pi.status === 'succeeded') return { status: 'succeeded', paymentIntentId: pi.id };
    return { status: 'requires_customer_action', paymentIntentId: pi.id, message: `PaymentIntent is ${pi.status}` };
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string; raw?: { payment_intent?: { id?: string } } };
    if (e.type === 'StripeCardError') {
      return {
        status: 'requires_customer_action',
        paymentIntentId: e.raw?.payment_intent?.id ?? null,
        message: e.code === 'authentication_required' ? 'Customer must authenticate this charge.' : (e.message ?? 'Card declined.'),
      };
    }
    throw err;
  }
}
