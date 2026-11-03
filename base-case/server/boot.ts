/**
 * Shared startup for index.ts, seed.ts and create-admin.ts: env -> config -> db -> migrations -> crypto -> deps.
 */
import Anthropic from '@anthropic-ai/sdk';
import { loadDotEnv } from './env';
import { configFromEnv, type Config } from './config';
import { createLogger, type Logger } from './log';
import { connect, type DbConn } from './db/index';
import { migrate } from './db/migrate';
import { Envelope, resolveMasterKey } from './crypto';
import { consoleMailer } from './mailer';
import { createRateLimiters } from './auth/rateLimit';
import { systemClock, type AppDeps } from './types';
import { sql } from 'drizzle-orm';

export interface Booted {
  deps: AppDeps;
  conn: DbConn;
  config: Config;
  logger: Logger;
}

export async function boot(opts: { config?: Config; logger?: Logger; memory?: boolean } = {}): Promise<Booted> {
  if (!opts.config) loadDotEnv();
  const config = opts.config ?? configFromEnv();
  const logger = opts.logger ?? createLogger(config.logLevel);
  const t0 = Date.now();
  const conn = await connect({ databaseUrl: config.databaseUrl, dataDir: config.dataDir, memory: opts.memory });
  const applied = await migrate(conn);
  logger.info('database ready', { db: conn.kind, migrationsApplied: applied.length, ms: Date.now() - t0 });
  const key = resolveMasterKey({ masterKeyHex: config.masterKeyHex, dataDir: config.dataDir, isProduction: config.env === 'production', logger });
  const crypto = new Envelope(key);
  await verifyMasterKey(conn.db, crypto, logger);
  let anthropic: Anthropic | null = null;
  const deps: AppDeps = {
    db: conn.db,
    dbKind: conn.kind,
    config,
    clock: systemClock,
    crypto,
    mailer: consoleMailer(logger),
    logger,
    anthropic: () => {
      if (!config.anthropicApiKey) return null;
      anthropic ??= new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2, timeout: 60_000 });
      return anthropic;
    },
    rateLimiters: createRateLimiters(),
  };
  return { deps, conn, config, logger };
}

/**
 * Key canary: the first boot encrypts a known value under the master key and stores it in settings; every later boot
 * must decrypt it. A wrong BASE_CASE_MASTER_KEY therefore fails at startup instead of surfacing unreadable plans.
 */
export async function verifyMasterKey(db: AppDeps['db'], crypto: Envelope, logger: Logger): Promise<void> {
  const AAD = 'settings:value:crypto.keycheck';
  const res = (await db.execute(sql`select value from settings where key = 'crypto.keycheck'`)) as unknown as { rows?: { value: unknown }[] } | { value: unknown }[];
  const rows = Array.isArray(res) ? res : (res.rows ?? []);
  if (rows.length === 0) {
    const blob = crypto.encryptJson({ canary: 'base-case' }, AAD);
    await db.execute(sql`insert into settings (key, value) values ('crypto.keycheck', ${JSON.stringify({ blob })}::jsonb) on conflict (key) do nothing`);
    logger.info('master key canary stored');
    return;
  }
  const value = rows[0].value as { blob?: string } | string;
  const blob = typeof value === 'string' ? (JSON.parse(value) as { blob?: string }).blob : value?.blob;
  try {
    const out = crypto.decryptJson<{ canary?: string }>(String(blob), AAD);
    if (out.canary !== 'base-case') throw new Error('canary mismatch');
  } catch {
    throw new Error('BASE_CASE_MASTER_KEY does not match the key that encrypted this database. Refusing to start (set the original key, or use a fresh data directory / database).');
  }
}
