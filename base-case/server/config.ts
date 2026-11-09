/**
 * Server configuration, resolved once from the environment. Nothing here is logged verbatim.
 */
import { productConfig, productFromEnv, type ProductKey } from '../shared/product';

export type NodeEnv = 'development' | 'production' | 'test';

export interface Config {
  env: NodeEnv;
  port: number;
  /** Public origin of the app, e.g. http://localhost:5173 */
  appOrigin: string;
  databaseUrl: string | null;
  /** Directory for the embedded PGlite database and the dev master key */
  dataDir: string;
  /** 64 hex chars; resolved by crypto.resolveMasterKey when empty */
  masterKeyHex: string | null;
  anthropicApiKey: string | null;
  chatModel: string;
  /** Which product this instance serves: 'base-case' (graduates) or 'flight-plan' (airline pilots) */
  product: ProductKey;
  firmName: string;
  bootstrapAdminEmail: string | null;
  bootstrapAdminPassword: string | null;
  demoSeed: boolean;
  /** Trust X-Forwarded-For / X-Forwarded-Proto (only behind a reverse proxy you control) */
  trustProxy: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

function str(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv: NodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const demoSeedRaw = str(env.DEMO_SEED);
  const product = productFromEnv(env.PRODUCT);
  return {
    product,
    env: nodeEnv,
    port: Number(str(env.PORT) ?? 8787) || 8787,
    appOrigin: (str(env.APP_ORIGIN) ?? 'http://localhost:5173').replace(/\/+$/, ''),
    databaseUrl: str(env.DATABASE_URL),
    dataDir: str(env.BASE_CASE_DATA_DIR) ?? './data',
    masterKeyHex: str(env.BASE_CASE_MASTER_KEY),
    anthropicApiKey: str(env.ANTHROPIC_API_KEY),
    chatModel: str(env.BASE_CASE_CHAT_MODEL) ?? 'claude-opus-5-5',
    firmName: str(env.FIRM_NAME) ?? productConfig(product).name,
    bootstrapAdminEmail: str(env.BOOTSTRAP_ADMIN_EMAIL),
    bootstrapAdminPassword: str(env.BOOTSTRAP_ADMIN_PASSWORD),
    demoSeed: demoSeedRaw === null ? nodeEnv !== 'production' : demoSeedRaw === '1' || demoSeedRaw.toLowerCase() === 'true',
    trustProxy: (str(env.TRUST_PROXY) ?? '0') === '1',
    logLevel: (str(env.LOG_LEVEL) as Config['logLevel'] | null) ?? (nodeEnv === 'test' ? 'silent' : 'info'),
  };
}

/** Config used by tests and scripts: in-memory DB, fixed key, no network. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    env: 'test',
    port: 0,
    appOrigin: 'http://localhost:5173',
    databaseUrl: null,
    dataDir: './data',
    masterKeyHex: 'a'.repeat(64),
    anthropicApiKey: null,
    chatModel: 'claude-opus-5-5',
    product: 'base-case',
    firmName: 'Test Firm',
    bootstrapAdminEmail: null,
    bootstrapAdminPassword: null,
    demoSeed: false,
    trustProxy: true,
    logLevel: 'silent',
    ...overrides,
  };
}
