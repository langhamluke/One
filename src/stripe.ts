import Stripe from 'stripe';

let client: Stripe | null = null;

// One client instance per process, created lazily so importing this module
// never requires the key to be present (e.g. during typecheck or tests).
// The SDK pins its own API version (2026-09-30.endive for stripe@23.0.0).
export function getStripe(secretKey: string): Stripe {
  client ??= new Stripe(secretKey, {
    appInfo: { name: 'slopecycle-payments', url: 'https://slopecycleski.com' },
    maxNetworkRetries: 2,
  });
  return client;
}
