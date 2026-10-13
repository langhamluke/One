export interface Config {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  publicBaseUrl: string;
  shipToCountries: string[];
  requireTermsOfService: boolean;
  port: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(): Config {
  const stripeSecretKey = required('STRIPE_SECRET_KEY');
  if (stripeSecretKey.startsWith('sk_')) {
    console.warn(
      '[stripe] STRIPE_SECRET_KEY is a full secret key. Switch to a restricted key (rk_) ' +
        'with only the permissions listed in docs/STRIPE_INTEGRATION_PLAN.md.',
    );
  }

  return {
    stripeSecretKey,
    stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET'),
    publicBaseUrl: required('PUBLIC_BASE_URL').replace(/\/$/, ''),
    shipToCountries: (process.env.SHIP_TO_COUNTRIES ?? '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    requireTermsOfService: process.env.REQUIRE_TERMS_OF_SERVICE === 'true',
    port: Number(process.env.PORT ?? 4242),
  };
}
