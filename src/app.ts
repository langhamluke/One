import express from 'express';
import type Stripe from 'stripe';
import { CartError, createRentalCheckoutSession, parseCart } from './checkout.ts';
import type { Config } from './config.ts';
import type { RentalStore } from './store.ts';
import { handleStripeEvent, type WebhookDeps } from './webhooks.ts';

export interface AppDeps {
  stripe: Stripe;
  config: Config;
  store: RentalStore;
  onRentalPaid?: WebhookDeps['onRentalPaid'];
  onRentalPaymentFailed?: WebhookDeps['onRentalPaymentFailed'];
}

export function createApp(deps: AppDeps) {
  const { stripe, config, store } = deps;
  const app = express();
  app.disable('x-powered-by');

  // Must be registered before express.json(): signature verification needs
  // the exact raw bytes Stripe sent.
  app.post('/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.header('stripe-signature') ?? '', config.stripeWebhookSecret);
    } catch {
      res.status(400).send('Invalid signature');
      return;
    }
    try {
      await handleStripeEvent(event, {
        stripe,
        store,
        onRentalPaid: deps.onRentalPaid,
        onRentalPaymentFailed: deps.onRentalPaymentFailed,
      });
      res.json({ received: true });
    } catch (err) {
      // A non-2xx makes Stripe retry delivery with backoff.
      console.error(`[stripe] failed to handle ${event.type} ${event.id}:`, (err as Error).message);
      res.status(500).send('Handler error');
    }
  });

  app.use(express.json({ limit: '16kb' }));

  // The storefront (slopecycleski.com) calls these routes from the browser.
  app.use('/api', (req, res, next) => {
    if (req.header('origin') === config.publicBaseUrl) {
      res.setHeader('Access-Control-Allow-Origin', config.publicBaseUrl);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.post('/api/checkout', async (req, res) => {
    try {
      const children = parseCart(req.body);
      const session = await createRentalCheckoutSession(stripe, config, children);
      res.json({ url: session.url });
    } catch (err) {
      if (err instanceof CartError) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error('[stripe] checkout session create failed:', (err as Error).message);
      res.status(500).json({ error: 'Could not start checkout. Please try again.' });
    }
  });

  // For the confirmation page only. Display state here, but never fulfil from
  // it: fulfilment happens in the webhook.
  app.get('/api/checkout/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }
    const rental = await store.get(sessionId);
    if (rental) {
      res.json({ status: rental.status, email: rental.email });
      return;
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      res.json({ status: session.payment_status === 'paid' ? 'processing_confirmation' : 'awaiting_payment' });
    } catch {
      res.status(404).json({ error: 'Not found' });
    }
  });

  return app;
}
