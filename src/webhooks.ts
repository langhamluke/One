import type Stripe from 'stripe';
import type { Rental, RentalStatus, RentalStore } from './store.ts';

export interface WebhookDeps {
  stripe: Pick<Stripe, 'checkout'>;
  store: RentalStore;
  // Side effects for a newly paid rental: confirmation email, reserving gear,
  // scheduling shipment. Called once per rental, again only if it threw.
  onRentalPaid?: (rental: Rental) => Promise<void>;
  onRentalPaymentFailed?: (rental: Rental) => Promise<void>;
}

const HANDLED = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
]);

function parseChildren(raw: string | undefined): Rental['children'] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as [string, string, string][]).map(([packageLookupKey, ageBracket, size]) => ({
      packageLookupKey,
      ageBracket,
      size,
    }));
  } catch {
    return [];
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  const eventSession = event.data.object as Stripe.Checkout.Session;
  // Re-read the session instead of trusting the event payload, so retried or
  // out-of-order deliveries always act on current state.
  const session = await deps.stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ['payment_intent'],
  });
  const paymentIntent =
    session.payment_intent && typeof session.payment_intent !== 'string' ? session.payment_intent : null;

  // Fulfil only once the session is actually paid; with delayed payment
  // methods checkout.session.completed arrives while still unpaid.
  let status: RentalStatus;
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    status = 'paid';
  } else if (event.type === 'checkout.session.async_payment_failed') {
    status = 'payment_failed';
  } else {
    status = 'awaiting_payment';
  }

  const existing = await deps.store.get(session.id);
  // Never move a paid rental backwards.
  if (existing?.status === 'paid') return;
  if (existing?.status === status) return;

  const rental: Rental = {
    checkoutSessionId: session.id,
    status,
    season: session.metadata?.season ?? '',
    customerId: idOf(session.customer),
    paymentIntentId: idOf(session.payment_intent),
    paymentMethodId: idOf(paymentIntent?.payment_method),
    email: session.customer_details?.email ?? null,
    amountTotal: session.amount_total,
    currency: session.currency,
    children: parseChildren(session.metadata?.children),
    updatedAt: new Date().toISOString(),
  };
  // Side effects run before the record is saved: if one throws, the webhook
  // responds 500 and Stripe retries, so keep the callbacks idempotent.
  if (status === 'paid') await deps.onRentalPaid?.(rental);
  if (status === 'payment_failed') await deps.onRentalPaymentFailed?.(rental);
  await deps.store.put(rental);
}
