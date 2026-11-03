/**
 * HTTP middleware: request context + logging, security headers, CSRF, session loading, auth/role/MFA guards.
 */
import type { Context, MiddlewareHandler, Next } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { AppDeps, AppEnv } from '../types';
import type { Role } from '../../shared/lib/types';
import { HttpError, forbidden, unauthorized } from '../errors';
import { sessions, users } from '../db/schema';
import { hashSessionToken, isSessionLive, readSessionCookie, sessionExpiry, SESSION_TOUCH_INTERVAL_MS } from './session';
import { getSetting } from '../services/settings';
import type { Actor } from './authorize';

export type AppContext = Context<AppEnv>;

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'base-case';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function clientIp(c: AppContext, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first.slice(0, 64);
    }
  }
  try {
    const info = getConnInfo(c);
    if (info?.remote?.address) return String(info.remote.address).slice(0, 64);
  } catch {
    /* not running under @hono/node-server (tests) */
  }
  return 'unknown';
}

/** Request id, ip, timing and the structured access log. Never logs bodies, cookies or tokens. */
export function requestContext(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = Date.now();
    const reqId = randomUUID();
    c.set('reqId', reqId);
    c.set('ip', clientIp(c, deps.config.trustProxy));
    c.set('user', null);
    c.set('session', null);
    c.set('userId', null);
    c.header('X-Request-Id', reqId);
    await next();
    const ms = Date.now() - start;
    const route = `${c.req.method} ${c.req.routePath && c.req.routePath !== '/*' ? c.req.routePath : c.req.path}`;
    const status = c.res.status;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    deps.logger[level]('request', { reqId, userId: c.get('userId'), route, status, ms });
  };
}

export function securityHeaders(appOrigin: string): MiddlewareHandler<AppEnv> {
  const https = appOrigin.startsWith('https://');
  const csp = [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return async (c, next) => {
    await next();
    c.res.headers.set('Content-Security-Policy', csp);
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (https) c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (c.req.path.startsWith('/api')) {
      c.res.headers.set('Cache-Control', 'no-store');
      c.res.headers.set('Pragma', 'no-cache');
    }
  };
}

/**
 * CSRF: state-changing requests must carry the custom header `X-Requested-With: base-case` (cannot be set
 * cross-site without CORS) AND an Origin (or Referer) matching APP_ORIGIN or this request's own origin.
 */
export function csrf(appOrigin: string, trustProxy: boolean): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!MUTATING.has(c.req.method)) return next();
    if (c.req.header(CSRF_HEADER) !== CSRF_HEADER_VALUE) throw forbidden('Missing X-Requested-With header', 'csrf');
    let origin = c.req.header('origin') ?? null;
    if (!origin) {
      const ref = c.req.header('referer');
      if (ref) {
        try {
          origin = new URL(ref).origin;
        } catch {
          origin = null;
        }
      }
    }
    if (!origin) throw forbidden('Missing Origin header', 'csrf');
    const allowed = new Set<string>([appOrigin]);
    try {
      allowed.add(new URL(c.req.url).origin);
    } catch {
      /* ignore */
    }
    const host = c.req.header('host');
    if (host) {
      const proto = (trustProxy && c.req.header('x-forwarded-proto')) || (appOrigin.startsWith('https://') ? 'https' : 'http');
      allowed.add(`${proto}://${host}`);
      allowed.add(`http://${host}`);
    }
    if (!allowed.has(origin)) throw forbidden('Origin not allowed', 'csrf');
    return next();
  };
}

/** Resolve the session cookie into c.var.user / c.var.session (no error when absent). */
export function loadSession(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readSessionCookie(c);
    if (!token) return next();
    const id = hashSessionToken(token);
    const now = deps.clock.now();
    const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!row) return next();
    if (!isSessionLive(row, now)) {
      await deps.db.delete(sessions).where(eq(sessions.id, id));
      return next();
    }
    const [user] = await deps.db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || user.status !== 'active') {
      await deps.db.delete(sessions).where(eq(sessions.id, id));
      return next();
    }
    if (now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      const sessionHours = await getSetting(deps, 'sessionHours');
      const expiresAt = sessionExpiry(now, row.createdAt, sessionHours);
      await deps.db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
      row.lastSeenAt = now;
      row.expiresAt = expiresAt;
    }
    c.set('user', user);
    c.set('session', row);
    c.set('userId', user.id);
    return next();
  };
}

/** Paths an MFA-pending session may still call. */
const MFA_PENDING_ALLOW = new Set(['/api/me', '/api/auth/mfa/verify', '/api/auth/logout']);

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  const session = c.get('session');
  if (!user || !session) throw unauthorized();
  await next();
};

/** Block everything except the allowlist while a session still needs its TOTP code. */
export const requireMfaIfEnabled: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  const session = c.get('session');
  if (user && session && user.totpEnabled && !session.mfaVerified && !MFA_PENDING_ALLOW.has(c.req.path)) {
    throw new HttpError(401, 'MFA verification required', 'mfa_required');
  }
  await next();
};

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next: Next) => {
    const user = c.get('user');
    if (!user) throw unauthorized();
    if (!roles.includes(user.role as Role)) throw forbidden('Insufficient role');
    await next();
  };
}

export function actorOf(c: AppContext): Actor & { displayName: string } {
  const u = c.get('user');
  if (!u) throw unauthorized();
  return { id: u.id, role: u.role as Role, displayName: u.displayName };
}

export function currentUser(c: AppContext) {
  const u = c.get('user');
  if (!u) throw unauthorized();
  return u;
}

export function currentSession(c: AppContext) {
  const s = c.get('session');
  if (!s) throw unauthorized();
  return s;
}
