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
