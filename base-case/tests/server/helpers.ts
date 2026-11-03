/**
 * Test harness: in-memory PGlite + createApp, with helpers for users, assignments, login and CSRF-correct requests.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/app';
import { testConfig, type Config } from '../../server/config';
import { connect, type DbConn } from '../../server/db/index';
import { migrate } from '../../server/db/migrate';
import { advisorClients, users } from '../../server/db/schema';
import { Envelope } from '../../server/crypto';
import { silentLogger } from '../../server/log';
import { silentMailer } from '../../server/mailer';
import { createRateLimiters } from '../../server/auth/rateLimit';
import { hashPassword } from '../../server/auth/password';
import type { AppDeps, Clock } from '../../server/types';
import type { Role } from '../../shared/lib/types';

export const ORIGIN = 'http://localhost:5173';
export const CSRF_HEADERS = { Origin: ORIGIN, 'X-Requested-With': 'base-case' };

export class TestClock implements Clock {
  constructor(public t = new Date('2026-11-03T12:00:00Z')) {}
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  conn: DbConn;
  clock: TestClock;
  close(): Promise<void>;
}

export async function makeApp(opts: { config?: Partial<Config>; anthropic?: () => Anthropic | null; clock?: TestClock } = {}): Promise<TestApp> {
  const conn = await connect({ memory: true });
  await migrate(conn);
  const config = testConfig(opts.config);
  const clock = opts.clock ?? new TestClock();
  const deps: AppDeps = {
    db: conn.db,
    dbKind: conn.kind,
    config,
    clock,
    crypto: new Envelope(config.masterKeyHex!),
    mailer: silentMailer,
    logger: silentLogger,
    anthropic: opts.anthropic ?? (() => null),
    rateLimiters: createRateLimiters(),
  };
  const app = createApp(deps);
  return { app, deps, conn, clock, close: () => conn.close() };
}

export async function createUser(t: TestApp, input: { email: string; password: string; role: Role; displayName?: string; status?: 'invited' | 'active' | 'disabled' }): Promise<string> {
  const id = randomUUID();
  await t.deps.db.insert(users).values({
    id,
    email: input.email.toLowerCase(),
    passwordHash: input.status === 'invited' ? null : await hashPassword(input.password),
    role: input.role,
    displayName: input.displayName ?? input.email.split('@')[0],
    status: input.status ?? 'active',
    createdAt: t.clock.now(),
  });
  return id;
}

export async function assign(t: TestApp, advisorId: string, clientId: string): Promise<void> {
  await t.deps.db.insert(advisorClients).values({ advisorId, clientId, createdAt: t.clock.now() }).onConflictDoNothing();
}

export interface ReqOptions {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Omit CSRF headers (to test rejection) */
  noCsrf?: boolean;
  ip?: string;
}

export async function req(t: TestApp, method: string, path: string, opts: ReqOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.noCsrf ? {} : CSRF_HEADERS), ...(opts.headers ?? {}) };
  if (opts.cookie) headers.Cookie = `bc_session=${opts.cookie}`;
  if (opts.ip) headers['X-Forwarded-For'] = opts.ip;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  return t.app.request(`${ORIGIN}${path}`, { method, headers, body });
}

export function cookieFrom(res: Response): string | undefined {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const m = /bc_session=([^;]+)/.exec(setCookie);
  return m?.[1];
}

export async function login(t: TestApp, email: string, password: string, ip = '10.0.0.1'): Promise<string> {
  const res = await req(t, 'POST', '/api/auth/login', { body: { email, password }, ip });
  if (res.status !== 200) throw new Error(`login failed (${res.status}): ${await res.text()}`);
  const cookie = cookieFrom(res);
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
