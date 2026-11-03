/**
 * Dependency bag passed to createApp, plus Hono context variable types.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { Db } from './db/index';
import type { Config } from './config';
import type { Envelope } from './crypto';
import type { Logger } from './log';
import type { RateLimiters } from './auth/rateLimit';
import type { SessionRow, UserRow } from './db/schema';

export interface Clock {
  now(): Date;
}

export interface Mailer {
  /** Deliver an invite / reset link. The default implementation logs the link (dev convenience). */
  sendInvite(msg: { to: string; displayName: string; inviteUrl: string; expiresAt: Date; kind: 'invite' | 'reset' }): Promise<void>;
}

export type AnthropicFactory = () => Anthropic | null;

export interface AppDeps {
  db: Db;
  dbKind: 'pglite' | 'pg';
  config: Config;
  clock: Clock;
  crypto: Envelope;
  mailer: Mailer;
  logger: Logger;
  anthropic: AnthropicFactory;
  rateLimiters: RateLimiters;
}

export type AppEnv = {
  Variables: {
    reqId: string;
    ip: string;
    user: UserRow | null;
    session: SessionRow | null;
    /** Set once a route resolves the current user, so the request log can carry the id */
    userId: string | null;
  };
};

export const systemClock: Clock = { now: () => new Date() };
