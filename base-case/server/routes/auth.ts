/**
 * /api/auth/* and /api/me
 */
import { Hono } from 'hono';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LoginResponse, MeResponse, MfaSetupResponse, SessionInfo } from '../../shared/api';
import type { AppDeps, AppEnv } from '../types';
import { invites, sessions, users } from '../db/schema';
import { HttpError, badRequest, notFound, unauthorized } from '../errors';
import { hashPassword, passwordPolicyError, verifyPassword } from '../auth/password';
import { clearSessionCookie, newSessionToken, sessionExpiry, writeSessionCookie } from '../auth/session';
import { generateTotpSecret, base32Decode, otpauthUrl, qrDataUrl, verifyTotp } from '../auth/totp';
import { LOCKOUT_MS, LOCKOUT_THRESHOLD } from '../auth/rateLimit';
import { currentSession, currentUser, requireAuth, type AppContext } from '../auth/middleware';
import { audit, emailHash } from '../services/audit';
import { getSetting, getSettings } from '../services/settings';
import { findUserByEmail, normalizeEmail, userSummary } from '../services/users';
import { latestDataAsOf } from '../services/dataStatus';
import { aad, sha256Hex } from '../crypto';
import { parseBody } from './util';

const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const TOTP_AAD = (userId: string) => aad('users', 'totp_secret_enc', userId);

export async function createSession(deps: AppDeps, c: AppContext, userId: string, mfaVerified: boolean): Promise<string> {
  const { token, hash } = newSessionToken();
  const now = deps.clock.now();
  const sessionHours = await getSetting(deps, 'sessionHours');
  await deps.db.insert(sessions).values({
    id: hash,
    userId,
    createdAt: now,
    expiresAt: sessionExpiry(now, now, sessionHours),
    lastSeenAt: now,
    ip: c.get('ip'),
    userAgent: (c.req.header('user-agent') ?? '').slice(0, 300),
    mfaVerified,
  });
  writeSessionCookie(c, token, deps.config.appOrigin.startsWith('https://'));
  return hash;
}

export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function authRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const secure = deps.config.appOrigin.startsWith('https://');

  // ---- login ------------------------------------------------------------------------------
  app.post('/auth/login', async (c) => {
    const body = await parseBody(c, z.object({ email: z.string().max(254), password: z.string().max(256) }));
    const email = normalizeEmail(body.email);
    const ip = c.get('ip');
    const limit = deps.rateLimiters.login.hit(`login:${ip}:${email}`, deps.clock.now().getTime());
    if (!limit.allowed) {
      throw new HttpError(429, 'Too many login attempts. Try again later.', 'rate_limited', { 'Retry-After': String(limit.retryAfterSec) });
    }
    const now = deps.clock.now();
    const user = await findUserByEmail(deps.db, email);
    if (!user || user.status !== 'active' || !user.passwordHash) {
      await verifyPassword(body.password, null); // equalise timing
      await audit(deps, { action: 'login.failure', ip, metadata: { emailHash: emailHash(email), reason: user ? 'inactive' : 'unknown' } });
      throw unauthorized(GENERIC_LOGIN_ERROR, 'invalid_credentials');
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      await verifyPassword(body.password, null);
      await audit(deps, { actorId: user.id, action: 'login.locked', ip, metadata: { emailHash: emailHash(email) } });
      throw unauthorized(GENERIC_LOGIN_ERROR, 'invalid_credentials');
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= LOCKOUT_THRESHOLD;
      await deps.db
        .update(users)
        .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MS) : user.lockedUntil })
        .where(eq(users.id, user.id));
      await audit(deps, { actorId: user.id, action: lock ? 'login.locked' : 'login.failure', ip, metadata: { emailHash: emailHash(email), failed } });
      throw unauthorized(GENERIC_LOGIN_ERROR, 'invalid_credentials');
    }
    await deps.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
    const mfaRequired = user.totpEnabled;
    const sessionId = await createSession(deps, c, user.id, !mfaRequired);
    c.set('userId', user.id);
    await audit(deps, { actorId: user.id, action: mfaRequired ? 'login.mfa_required' : 'login.success', ip, metadata: { sessionId: sessionId.slice(0, 12) } });
    const res: LoginResponse = mfaRequired ? { ok: true, mfaRequired: true } : { ok: true, mfaRequired: false, user: await userSummary(deps.db, { ...user, lastLoginAt: now }) };
    return c.json(res);
  });

  // ---- MFA verify (pending session) -------------------------------------------------------
  app.post('/auth/mfa/verify', requireAuth, async (c) => {
    const user = currentUser(c);
    const session = currentSession(c);
    const body = await parseBody(c, z.object({ code: z.string().max(16) }));
    const ip = c.get('ip');
    if (!user.totpEnabled || !user.totpSecretEnc) throw badRequest('MFA is not enabled on this account', 'mfa_not_enabled');
    const limit = deps.rateLimiters.login.hit(`mfa:${ip}:${user.id}`, deps.clock.now().getTime());
    if (!limit.allowed) throw new HttpError(429, 'Too many attempts. Try again later.', 'rate_limited', { 'Retry-After': String(limit.retryAfterSec) });
    const secret = base32Decode(deps.crypto.decrypt(user.totpSecretEnc, TOTP_AAD(user.id)).toString('utf8'));
    const counter = verifyTotp(secret, body.code, deps.clock.now().getTime(), user.totpLastCounter);
    if (counter === null) {
      await audit(deps, { actorId: user.id, action: 'mfa.failed', ip });
      throw unauthorized('Invalid code', 'invalid_code');
    }
    await deps.db.update(users).set({ totpLastCounter: counter }).where(eq(users.id, user.id));
    await deps.db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, session.id));
    await audit(deps, { actorId: user.id, action: 'mfa.verified', ip });
    await audit(deps, { actorId: user.id, action: 'login.success', ip, metadata: { sessionId: session.id.slice(0, 12), mfa: true } });
    return c.json({ ok: true, user: await userSummary(deps.db, user) });
  });

  // ---- logout -----------------------------------------------------------------------------
  app.post('/auth/logout', async (c) => {
    const session = c.get('session');
    const user = c.get('user');
    if (session) {
      await deps.db.delete(sessions).where(eq(sessions.id, session.id));
      await audit(deps, { actorId: user?.id ?? null, action: 'logout', ip: c.get('ip') });
    }
    clearSessionCookie(c, secure);
    return c.json({ ok: true });
  });

  // ---- me ---------------------------------------------------------------------------------
  app.get('/me', requireAuth, async (c) => {
    const user = currentUser(c);
    const session = currentSession(c);
    const s = await getSettings(deps);
    const res: MeResponse & { mustSetupMfa?: boolean } = {
      user: await userSummary(deps.db, user),
      firm: {
        name: s.firmName,
        assistantMode: deps.config.anthropicApiKey && s.assistantEnabled ? 'claude' : 'offline',
        dataAsOf: latestDataAsOf(),
        product: deps.config.product,
      },
    };
    if (user.totpEnabled && !session.mfaVerified) res.mfaPending = true;
    if (s.requireMfaForStaff && user.role !== 'client' && !user.totpEnabled) res.mustSetupMfa = true;
    return c.json(res);
  });

  // ---- invites ----------------------------------------------------------------------------
  const inviteSelect = async (token: string) => {
    if (!token || token.length > 128) return null;
    const now = deps.clock.now();
    const [row] = await deps.db
      .select({ invite: invites, user: users })
      .from(invites)
      .innerJoin(users, eq(users.id, invites.userId))
      .where(and(eq(invites.tokenHash, sha256Hex(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, now)))
      .limit(1);
    if (!row || row.user.status === 'disabled') return null;
    return row;
  };

  app.get('/auth/invite/:token', async (c) => {
    const row = await inviteSelect(c.req.param('token'));
    if (!row) throw notFound('Invite is invalid or has expired', 'invalid_invite');
    return c.json({ email: row.user.email, displayName: row.user.displayName, role: row.user.role });
  });

  app.post('/auth/accept-invite', async (c) => {
    const body = await parseBody(
      c,
      z.object({ token: z.string().min(1).max(128), password: z.string().max(256), displayName: z.string().max(120).optional().default('') }),
    );
    const row = await inviteSelect(body.token);
    if (!row) throw notFound('Invite is invalid or has expired', 'invalid_invite');
    const policy = passwordPolicyError(body.password, row.user.email);
    if (policy) throw badRequest(policy, 'weak_password');
    const now = deps.clock.now();
    const wasInvited = row.user.status === 'invited';
    const displayName = body.displayName.trim() || row.user.displayName;
    const passwordHash = await hashPassword(body.password);
    await deps.db
      .update(users)
      .set({ passwordHash, status: 'active', displayName, passwordChangedAt: now, failedLogins: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(users.id, row.user.id));
    await deps.db.update(invites).set({ acceptedAt: now }).where(eq(invites.id, row.invite.id));
    // Any other outstanding tokens for this user are now void; existing sessions are revoked.
    await deps.db.update(invites).set({ acceptedAt: now }).where(and(eq(invites.userId, row.user.id), isNull(invites.acceptedAt)));
    await deps.db.delete(sessions).where(eq(sessions.userId, row.user.id));
    const ip = c.get('ip');
    await audit(deps, { actorId: row.user.id, action: wasInvited ? 'invite.accepted' : 'password.reset_completed', targetType: 'user', targetId: row.user.id, ip });
    const mfaRequired = row.user.totpEnabled;
    await createSession(deps, c, row.user.id, !mfaRequired);
    c.set('userId', row.user.id);
    await audit(deps, { actorId: row.user.id, action: mfaRequired ? 'login.mfa_required' : 'login.success', ip });
    const [fresh] = await deps.db.select().from(users).where(eq(users.id, row.user.id)).limit(1);
    return c.json({ ok: true, mfaRequired, user: await userSummary(deps.db, fresh) });
  });

  // ---- change password --------------------------------------------------------------------
  app.post('/auth/change-password', requireAuth, async (c) => {
    const user = currentUser(c);
    const session = currentSession(c);
    const body = await parseBody(c, z.object({ currentPassword: z.string().max(256), newPassword: z.string().max(256) }));
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect', 'invalid_credentials');
    const policy = passwordPolicyError(body.newPassword, user.email);
    if (policy) throw badRequest(policy, 'weak_password');
    const now = deps.clock.now();
    await deps.db.update(users).set({ passwordHash: await hashPassword(body.newPassword), passwordChangedAt: now }).where(eq(users.id, user.id));
    await deps.db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, session.id)));
    await audit(deps, { actorId: user.id, action: 'password.changed', targetType: 'user', targetId: user.id, ip: c.get('ip') });
    return c.json({ ok: true });
  });

  // ---- MFA setup / enable / disable --------------------------------------------------------
  app.post('/auth/mfa/setup', requireAuth, async (c) => {
    const user = currentUser(c);
    if (user.totpEnabled) throw badRequest('MFA is already enabled; disable it first to re-enroll', 'mfa_already_enabled');
    const secret = generateTotpSecret();
    await deps.db.update(users).set({ totpSecretEnc: deps.crypto.encrypt(secret, TOTP_AAD(user.id)), totpLastCounter: null }).where(eq(users.id, user.id));
    const firm = await getSetting(deps, 'firmName');
    const url = otpauthUrl(firm, user.email, secret);
    const res: MfaSetupResponse = { otpauthUrl: url, qrDataUrl: await qrDataUrl(url) };
    return c.json(res);
  });

  app.post('/auth/mfa/enable', requireAuth, async (c) => {
    const user = currentUser(c);
    const session = currentSession(c);
    const body = await parseBody(c, z.object({ code: z.string().max(16) }));
    if (user.totpEnabled) throw badRequest('MFA is already enabled', 'mfa_already_enabled');
    if (!user.totpSecretEnc) throw badRequest('Run MFA setup first', 'mfa_not_setup');
    const secret = base32Decode(deps.crypto.decrypt(user.totpSecretEnc, TOTP_AAD(user.id)).toString('utf8'));
    const counter = verifyTotp(secret, body.code, deps.clock.now().getTime(), null);
    if (counter === null) throw badRequest('Invalid code', 'invalid_code');
    await deps.db.update(users).set({ totpEnabled: true, totpLastCounter: counter }).where(eq(users.id, user.id));
    await deps.db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, session.id));
    // Other sessions must re-authenticate with MFA.
    await deps.db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, session.id)));
    await audit(deps, { actorId: user.id, action: 'mfa.enabled', targetType: 'user', targetId: user.id, ip: c.get('ip') });
    return c.json({ ok: true });
  });

  app.post('/auth/mfa/disable', requireAuth, async (c) => {
    const user = currentUser(c);
    const body = await parseBody(c, z.object({ code: z.string().max(16).optional(), password: z.string().max(256).optional() }));
    if (!user.totpEnabled) throw badRequest('MFA is not enabled', 'mfa_not_enabled');
    let verified = false;
    if (body.code && user.totpSecretEnc) {
      const secret = base32Decode(deps.crypto.decrypt(user.totpSecretEnc, TOTP_AAD(user.id)).toString('utf8'));
      verified = verifyTotp(secret, body.code, deps.clock.now().getTime(), user.totpLastCounter) !== null;
    }
    if (!verified && body.password) verified = await verifyPassword(body.password, user.passwordHash);
    if (!verified) throw unauthorized('Provide a valid authenticator code or your current password', 'verification_failed');
    const requireMfa = await getSetting(deps, 'requireMfaForStaff');
    if (requireMfa && user.role !== 'client') throw badRequest('Your firm requires MFA for staff accounts', 'mfa_required_by_policy');
    await deps.db.update(users).set({ totpEnabled: false, totpSecretEnc: null, totpLastCounter: null }).where(eq(users.id, user.id));
    await audit(deps, { actorId: user.id, action: 'mfa.disabled', targetType: 'user', targetId: user.id, ip: c.get('ip') });
    return c.json({ ok: true });
  });

  // ---- sessions ---------------------------------------------------------------------------
  app.get('/auth/sessions', requireAuth, async (c) => {
    const user = currentUser(c);
    const current = currentSession(c);
    const now = deps.clock.now();
    const rows = await deps.db.select().from(sessions).where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, now)));
    const out: SessionInfo[] = rows
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((s) => ({ id: s.id.slice(0, 16), createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), userAgent: s.userAgent ?? '', current: s.id === current.id }));
    return c.json(out);
  });

  app.delete('/auth/sessions/:id', requireAuth, async (c) => {
    const user = currentUser(c);
    const prefix = c.req.param('id');
    if (!/^[0-9a-f]{16}$/.test(prefix)) throw notFound('Session not found');
    const rows = await deps.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user.id));
    const target = rows.find((r) => r.id.startsWith(prefix));
    if (!target) throw notFound('Session not found');
    await deps.db.delete(sessions).where(eq(sessions.id, target.id));
    await audit(deps, { actorId: user.id, action: 'session.revoked', targetType: 'session', targetId: prefix, ip: c.get('ip') });
    if (target.id === currentSession(c).id) clearSessionCookie(c, secure);
    return c.json({ ok: true });
  });

  return app;
}

