/**
 * Session tokens: 32 random bytes (base64url) in an HttpOnly cookie; the database stores only sha256(token).
 * Sliding expiry of settings.sessionHours (default 12h), absolute maximum 7 days.
 */
import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sha256Hex } from '../crypto';

export const SESSION_COOKIE = 'bc_session';
export const SESSION_ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** Only touch last_seen/expiry when the last touch is older than this (avoid a write per request). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

export function sessionExpiry(now: Date, createdAt: Date, sessionHours: number): Date {
  const sliding = now.getTime() + Math.max(1, sessionHours) * 3600 * 1000;
  const absolute = createdAt.getTime() + SESSION_ABSOLUTE_MAX_MS;
  return new Date(Math.min(sliding, absolute));
}

export function isSessionLive(s: { expiresAt: Date; createdAt: Date }, now: Date): boolean {
  return s.expiresAt.getTime() > now.getTime() && s.createdAt.getTime() + SESSION_ABSOLUTE_MAX_MS > now.getTime();
}

export function readSessionCookie(c: Context): string | undefined {
  const v = getCookie(c, SESSION_COOKIE);
  return v && v.length > 0 && v.length < 256 ? v : undefined;
}

export function writeSessionCookie(c: Context, token: string, secure: boolean): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: SESSION_ABSOLUTE_MAX_MS / 1000,
  });
}

export function clearSessionCookie(c: Context, secure: boolean): void {
  deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: 'Lax', secure, path: '/' });
}
