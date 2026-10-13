import type Stripe from 'stripe';
import { SEASON, findPackage, isAgeBracket, type AgeBracket } from './catalog.ts';
import type { Config } from './config.ts';

// Tags these sessions in the Dashboard so this flow can be tracked and
// compared against others. Fixed per flow; the suffix is random letters.
export const INTEGRATION_IDENTIFIER = 'slopecycle_season_rental_qhzmvtrk';

// Session metadata values are capped at 500 characters, which bounds how many
// children fit in one order.
export const MAX_CHILDREN_PER_ORDER = 5;

export interface ChildRental {
  packageLookupKey: string;
  ageBracket: AgeBracket;
  size: string;
}

export class CartError extends Error {}

export function parseCart(body: unknown): ChildRental[] {
  const children = (body as { children?: unknown } | null)?.children;
  if (!Array.isArray(children) || children.length === 0) {
    throw new CartError('Add at least one child to the rental.');
  }
  if (children.length > MAX_CHILDREN_PER_ORDER) {
    throw new CartError(`At most ${MAX_CHILDREN_PER_ORDER} children per order.`);
  }
  return children.map((raw, i) => {
    const { packageLookupKey, ageBracket, size } = (raw ?? {}) as Record<string, unknown>;
    if (typeof packageLookupKey !== 'string' || !findPackage(packageLookupKey)) {
      throw new CartError(`Child ${i + 1}: unknown rental package.`);
    }
    if (typeof ageBracket !== 'string' || !isAgeBracket(ageBracket)) {
      throw new CartError(`Child ${i + 1}: unknown age bracket.`);
    }
    if (typeof size !== 'string' || !/^[A-Za-z0-9 \-/]{1,12}$/.test(size)) {
      throw new CartError(`Child ${i + 1}: invalid size.`);
    }
    return { packageLookupKey, ageBracket, size: size.trim() };
  });
}

// Prices are resolved server-side from lookup keys; the client never sends an
// amount or a Price ID.
export async function resolvePrices(
  stripe: Pick<Stripe, 'prices'>,
  lookupKeys: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(lookupKeys)];
  const prices = await stripe.prices.list({ lookup_keys: unique, active: true, limit: unique.length });
  const byKey = new Map(prices.data.flatMap((p) => (p.lookup_key ? [[p.lookup_key, p.id] as const] : [])));
  const missing = unique.filter((k) => !byKey.has(k));
  if (missing.length) {
    throw new Error(`No active Stripe Price for lookup key(s): ${missing.join(', ')}. Run npm run seed:catalog.`);
  }
  return byKey;
}

export function buildSessionParams(
  children: ChildRental[],
  priceIdsByLookupKey: Map<string, string>,
  config: Pick<Config, 'publicBaseUrl' | 'shipToCountries' | 'requireTermsOfService'>,
): Stripe.Checkout.SessionCreateParams {
  const quantities = new Map<string, number>();
  for (const child of children) {
    const priceId = priceIdsByLookupKey.get(child.packageLookupKey);
    if (!priceId) throw new Error(`Unresolved price for ${child.packageLookupKey}`);
    quantities.set(priceId, (quantities.get(priceId) ?? 0) + 1);
  }

  const metadata = {
    season: SEASON,
    children: JSON.stringify(children.map((c) => [c.packageLookupKey, c.ageBracket, c.size])),
  };

  // payment_method_types is deliberately omitted so Stripe shows the dynamic
  // set of payment methods enabled in the Dashboard.
  return {
    mode: 'payment',
    line_items: [...quantities].map(([price, quantity]) => ({ price, quantity })),
    // A Customer is required to keep the saved card for damage/late fees.
    customer_creation: 'always',
    payment_intent_data: {
      setup_future_usage: 'off_session',
      description: `Slopecycle ${SEASON} season rental`,
      metadata,
    },
    metadata,
    phone_number_collection: { enabled: true },
    ...(config.shipToCountries.length
      ? {
          shipping_address_collection: {
            allowed_countries: config.shipToCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          },
        }
      : {}),
    ...(config.requireTermsOfService ? { consent_collection: { terms_of_service: 'required' as const } } : {}),
    custom_text: {
      submit: {
        message:
          'Your payment method is saved so we can charge for unreturned or damaged gear under our rental terms. ' +
          'We will email you before any such charge.',
      },
    },
    allow_promotion_codes: true,
    integration_identifier: INTEGRATION_IDENTIFIER,
    success_url: `${config.publicBaseUrl}/rental/confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicBaseUrl}/rental`,
  };
}

export async function createRentalCheckoutSession(
  stripe: Stripe,
  config: Config,
  children: ChildRental[],
): Promise<Stripe.Checkout.Session> {
  const prices = await resolvePrices(stripe, children.map((c) => c.packageLookupKey));
  return stripe.checkout.sessions.create(buildSessionParams(children, prices, config));
}
