import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeApp, createUser, req, login, cookieFrom, json, type TestApp } from './helpers';
import { users, auditLog } from '../../server/db/schema';
import { totp, base32Decode } from '../../server/auth/totp';
import { aad } from '../../server/crypto';

describe('auth flow', () => {
  let t: TestApp;
  const email = 'client1@example.com';
  const password = 'Client-Password-2026!';
  let userId: string;
  beforeAll(async () => {
    t = await makeApp();
    userId = await createUser(t, { email, password, role: 'client', displayName: 'Client One' });
  });
  afterAll(() => t.close());

  it('health is public', async () => {
    const res = await req(t, 'GET', '/api/health', { noCsrf: true });
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it('rejects unauthenticated /api/me', async () => {
    const res = await req(t, 'GET', '/api/me');
    expect(res.status).toBe(401);
  });

  it('login sets an HttpOnly cookie and /api/me works', async () => {
    const res = await req(t, 'POST', '/api/auth/login', { body: { email: email.toUpperCase(), password }, ip: '1.1.1.1' });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, mfaRequired: false });
    expect(body.user.email).toBe(email);
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toContain('bc_session=');
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('SameSite=Lax');
    expect(sc).toContain('Path=/');
    const cookie = cookieFrom(res)!;
    const me = await req(t, 'GET', '/api/me', { cookie });
    expect(me.status).toBe(200);
    const meBody = await json(me);
    expect(meBody.user.id).toBe(userId);
    expect(meBody.firm.assistantMode).toBe('offline');
    expect(meBody.firm.name).toBe('Test Firm');
    expect(meBody.mfaPending).toBeUndefined();
  });

  it('wrong password and unknown email are the same generic 401', async () => {
    const a = await req(t, 'POST', '/api/auth/login', { body: { email, password: 'wrong-password-123' }, ip: '2.2.2.2' });
    const b = await req(t, 'POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'wrong-password-123' }, ip: '2.2.2.2' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await json(a)).toEqual(await json(b));
    const rows = await t.deps.db.select().from(auditLog).where(eq(auditLog.action, 'login.failure'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(JSON.stringify(r.metadata)).not.toContain('@');
  });

  it('rate limits after 5 attempts per ip+email with Retry-After', async () => {
    const ip = '3.3.3.3';
    let last: Response | undefined;
    for (let i = 0; i < 5; i++) last = await req(t, 'POST', '/api/auth/login', { body: { email: 'rl@example.com', password: 'wrong-password-123' }, ip });
    expect(last!.status).toBe(401);
    const blocked = await req(t, 'POST', '/api/auth/login', { body: { email: 'rl@example.com', password: 'wrong-password-123' }, ip });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // a different ip is a different bucket
    const other = await req(t, 'POST', '/api/auth/login', { body: { email: 'rl@example.com', password: 'wrong-password-123' }, ip: '3.3.3.4' });
    expect(other.status).toBe(401);
  });

  it('locks the account after 10 failed logins (even with the right password)', async () => {
    const lockEmail = 'lock@example.com';
    const lockPw = 'Lockout-Password-2026!';
    await createUser(t, { email: lockEmail, password: lockPw, role: 'client' });
    for (let i = 0; i < 10; i++) {
      const r = await req(t, 'POST', '/api/auth/login', { body: { email: lockEmail, password: 'wrong-password-123' }, ip: `4.4.4.${i}` });
      expect(r.status).toBe(401);
    }
    const locked = await req(t, 'POST', '/api/auth/login', { body: { email: lockEmail, password: lockPw }, ip: '4.4.4.100' });
    expect(locked.status).toBe(401);
    const [row] = await t.deps.db.select().from(users).where(eq(users.email, lockEmail));
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(t.clock.now().getTime());
    const lockedAudit = await t.deps.db.select().from(auditLog).where(eq(auditLog.action, 'login.locked'));
    expect(lockedAudit.length).toBeGreaterThanOrEqual(1);
    // after the lockout window the correct password works again
    t.clock.advance(16 * 60 * 1000);
    const ok = await req(t, 'POST', '/api/auth/login', { body: { email: lockEmail, password: lockPw }, ip: '4.4.4.101' });
    expect(ok.status).toBe(200);
  });

  it('logout clears the session', async () => {
    const cookie = await login(t, email, password, '5.5.5.5');
    const out = await req(t, 'POST', '/api/auth/logout', { cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    const me = await req(t, 'GET', '/api/me', { cookie });
    expect(me.status).toBe(401);
  });

  it('expires sessions: sliding 12h and absolute 7d', async () => {
    const cookie = await login(t, email, password, '5.5.5.6');
    t.clock.advance(11 * 3600 * 1000);
    expect((await req(t, 'GET', '/api/me', { cookie })).status).toBe(200); // touched -> extended
    t.clock.advance(11 * 3600 * 1000);
    expect((await req(t, 'GET', '/api/me', { cookie })).status).toBe(200);
    t.clock.advance(13 * 3600 * 1000);
    expect((await req(t, 'GET', '/api/me', { cookie })).status).toBe(401); // idle > 12h
    const cookie2 = await login(t, email, password, '5.5.5.7');
    for (let i = 0; i < 8 * 24; i++) {
      t.clock.advance(3600 * 1000);
      const r = await req(t, 'GET', '/api/me', { cookie: cookie2 });
      if (i < 7 * 24 - 1) expect(r.status).toBe(200);
    }
    expect((await req(t, 'GET', '/api/me', { cookie: cookie2 })).status).toBe(401); // absolute cap
  });

  it('CSRF: state-changing requests need Origin and X-Requested-With', async () => {
    const noHeader = await t.app.request('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ email, password }),
    });
    expect(noHeader.status).toBe(403);
    expect((await json(noHeader)).code).toBe('csrf');
    const noOrigin = await t.app.request('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'base-case' },
      body: JSON.stringify({ email, password }),
    });
    expect(noOrigin.status).toBe(403);
    const badOrigin = await req(t, 'POST', '/api/auth/login', { body: { email, password }, headers: { Origin: 'https://evil.example' } });
    expect(badOrigin.status).toBe(403);
    const refererOk = await req(t, 'POST', '/api/auth/login', { body: { email, password }, headers: { Origin: '', Referer: 'http://localhost:5173/login' }, ip: '6.6.6.6' });
    expect(refererOk.status).toBe(200);
  });

  it('invite -> info -> accept -> login', async () => {
    const adminPw = 'Admin-Password-2026!';
    const adminId = await createUser(t, { email: 'admin@example.com', password: adminPw, role: 'admin' });
    const advisorId = await createUser(t, { email: 'adv@example.com', password: adminPw, role: 'advisor' });
    const admin = await login(t, 'admin@example.com', adminPw, '7.7.7.7');
    const inv = await req(t, 'POST', '/api/admin/invites', { cookie: admin, body: { email: 'New.Client@Example.com', role: 'client', displayName: 'New Client', advisorId } });
    expect(inv.status).toBe(201);
    const invBody = await json(inv);
    expect(invBody.inviteUrl).toMatch(/^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
    const token = invBody.inviteUrl.split('/invite/')[1];
    const info = await req(t, 'GET', `/api/auth/invite/${token}`);
    expect(info.status).toBe(200);
    expect(await json(info)).toEqual({ email: 'new.client@example.com', displayName: 'New Client', role: 'client' });
    expect((await req(t, 'GET', '/api/auth/invite/not-a-token')).status).toBe(404);
    const weak = await req(t, 'POST', '/api/auth/accept-invite', { body: { token, password: 'short', displayName: 'New Client' } });
    expect(weak.status).toBe(400);
    const acc = await req(t, 'POST', '/api/auth/accept-invite', { body: { token, password: 'New-Client-Password-2026!', displayName: 'Newly Named' } });
    expect(acc.status).toBe(200);
    expect(cookieFrom(acc)).toBeTruthy();
    const accBody = await json(acc);
    expect(accBody.user.displayName).toBe('Newly Named');
    expect(accBody.user.advisorIds).toEqual([advisorId]);
    // token is single-use
    expect((await req(t, 'GET', `/api/auth/invite/${token}`)).status).toBe(404);
    const cookie = await login(t, 'new.client@example.com', 'New-Client-Password-2026!', '7.7.7.8');
    expect((await req(t, 'GET', '/api/me', { cookie })).status).toBe(200);
    // duplicate invite -> 409
    const dup = await req(t, 'POST', '/api/admin/invites', { cookie: admin, body: { email: 'new.client@example.com', role: 'client', displayName: 'x' } });
    expect(dup.status).toBe(409);
    // audit trail
    const actions = (await t.deps.db.select().from(auditLog)).map((r) => r.action);
    expect(actions).toContain('invite.created');
    expect(actions).toContain('invite.accepted');
    expect(adminId).toBeTruthy();
  });

  it('change password revokes other sessions and rejects weak passwords', async () => {
    const pw = 'Change-Me-Password-2026!';
    await createUser(t, { email: 'chg@example.com', password: pw, role: 'advisor' });
    const a = await login(t, 'chg@example.com', pw, '8.8.8.8');
    const b = await login(t, 'chg@example.com', pw, '8.8.8.9');
    expect((await req(t, 'POST', '/api/auth/change-password', { cookie: a, body: { currentPassword: 'nope-nope-nope-1', newPassword: 'Another-Password-2026!' } })).status).toBe(401);
    expect((await req(t, 'POST', '/api/auth/change-password', { cookie: a, body: { currentPassword: pw, newPassword: 'password' } })).status).toBe(400);
    expect((await req(t, 'POST', '/api/auth/change-password', { cookie: a, body: { currentPassword: pw, newPassword: 'Another-Password-2026!' } })).status).toBe(200);
    expect((await req(t, 'GET', '/api/me', { cookie: a })).status).toBe(200);
    expect((await req(t, 'GET', '/api/me', { cookie: b })).status).toBe(401);
    expect((await req(t, 'POST', '/api/auth/login', { body: { email: 'chg@example.com', password: 'Another-Password-2026!' }, ip: '8.8.8.10' })).status).toBe(200);
  });

  it('MFA: setup, enable, pending session restrictions, verify, sessions list/revoke, disable', async () => {
    const pw = 'Mfa-User-Password-2026!';
    const id = await createUser(t, { email: 'mfa@example.com', password: pw, role: 'advisor' });
    const cookie = await login(t, 'mfa@example.com', pw, '9.9.9.9');
    const setup = await req(t, 'POST', '/api/auth/mfa/setup', { cookie });
    expect(setup.status).toBe(200);
    const { otpauthUrl, qrDataUrl } = await json(setup);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const secretB32 = new URL(otpauthUrl).searchParams.get('secret')!;
    // the secret is stored encrypted, never in the clear
    const [row] = await t.deps.db.select().from(users).where(eq(users.id, id));
    expect(row.totpSecretEnc).not.toContain(secretB32);
    expect(t.deps.crypto.decrypt(row.totpSecretEnc!, aad('users', 'totp_secret_enc', id)).toString()).toBe(secretB32);
    const secret = base32Decode(secretB32);
    expect((await req(t, 'POST', '/api/auth/mfa/enable', { cookie, body: { code: '000000' } })).status).toBe(400);
    const code = totp(secret, t.clock.now().getTime());
    expect((await req(t, 'POST', '/api/auth/mfa/enable', { cookie, body: { code } })).status).toBe(200);
    expect((await json(await req(t, 'GET', '/api/me', { cookie }))).user.mfaEnabled).toBe(true);

    // fresh login now requires MFA; pending session can only reach /api/me (mfaPending) and verify/logout
    const res = await req(t, 'POST', '/api/auth/login', { body: { email: 'mfa@example.com', password: pw }, ip: '9.9.9.10' });
    expect(await json(res)).toEqual({ ok: true, mfaRequired: true });
    const pending = cookieFrom(res)!;
    const me = await req(t, 'GET', '/api/me', { cookie: pending });
    expect(me.status).toBe(200);
    expect((await json(me)).mfaPending).toBe(true);
    const blocked = await req(t, 'GET', '/api/clients', { cookie: pending });
    expect(blocked.status).toBe(401);
    expect((await json(blocked)).code).toBe('mfa_required');
    t.clock.advance(31_000); // move to the next step so the enable-time code is not replayed
    const bad = await req(t, 'POST', '/api/auth/mfa/verify', { cookie: pending, body: { code: '123456' } });
    expect(bad.status).toBe(401);
    const good = totp(secret, t.clock.now().getTime());
    expect((await req(t, 'POST', '/api/auth/mfa/verify', { cookie: pending, body: { code: good } })).status).toBe(200);
    // replay of the same code is rejected on a second pending session
    const res2 = await req(t, 'POST', '/api/auth/login', { body: { email: 'mfa@example.com', password: pw }, ip: '9.9.9.11' });
    const pending2 = cookieFrom(res2)!;
    expect((await req(t, 'POST', '/api/auth/mfa/verify', { cookie: pending2, body: { code: good } })).status).toBe(401);
    expect((await req(t, 'GET', '/api/clients', { cookie: pending })).status).toBe(200);
    expect((await json(await req(t, 'GET', '/api/me', { cookie: pending }))).mfaPending).toBeUndefined();

    // sessions: list and revoke the other one
    const list = await json(await req(t, 'GET', '/api/auth/sessions', { cookie: pending }));
    expect(list.length).toBeGreaterThanOrEqual(2);
    const other = list.find((s: any) => !s.current);
    expect((await req(t, 'DELETE', `/api/auth/sessions/${other.id}`, { cookie: pending })).status).toBe(200);
    expect((await req(t, 'GET', '/api/me', { cookie: pending2 })).status).toBe(401);

    // disable with password
    expect((await req(t, 'POST', '/api/auth/mfa/disable', { cookie: pending, body: { password: 'wrong-wrong-wrong' } })).status).toBe(401);
    expect((await req(t, 'POST', '/api/auth/mfa/disable', { cookie: pending, body: { password: pw } })).status).toBe(200);
    expect((await json(await req(t, 'GET', '/api/me', { cookie: pending }))).user.mfaEnabled).toBe(false);
  });

  it('requireMfaForStaff flags staff without MFA via mustSetupMfa', async () => {
    const pw = 'Staff-Password-2026!';
    await createUser(t, { email: 'staff2@example.com', password: pw, role: 'advisor' });
    await createUser(t, { email: 'admin2@example.com', password: pw, role: 'admin' });
    const admin = await login(t, 'admin2@example.com', pw, '10.10.10.10');
    expect((await req(t, 'PATCH', '/api/admin/settings', { cookie: admin, body: { requireMfaForStaff: true } })).status).toBe(200);
    const staff = await login(t, 'staff2@example.com', pw, '10.10.10.11');
    expect((await json(await req(t, 'GET', '/api/me', { cookie: staff }))).mustSetupMfa).toBe(true);
    const client = await login(t, email, password, '10.10.10.12');
    expect((await json(await req(t, 'GET', '/api/me', { cookie: client }))).mustSetupMfa).toBeUndefined();
    await req(t, 'PATCH', '/api/admin/settings', { cookie: admin, body: { requireMfaForStaff: false } });
  });

  it('disabled users cannot log in and existing sessions die', async () => {
    const pw = 'Disable-Me-Password-2026!';
    const id = await createUser(t, { email: 'dis@example.com', password: pw, role: 'client' });
    const cookie = await login(t, 'dis@example.com', pw, '11.11.11.11');
    const admin = await login(t, 'admin@example.com', 'Admin-Password-2026!', '11.11.11.12');
    const r = await req(t, 'PATCH', `/api/admin/users/${id}`, { cookie: admin, body: { status: 'disabled' } });
    expect(r.status).toBe(200);
    expect((await json(r)).status).toBe('disabled');
    expect((await req(t, 'GET', '/api/me', { cookie })).status).toBe(401);
    expect((await req(t, 'POST', '/api/auth/login', { body: { email: 'dis@example.com', password: pw }, ip: '11.11.11.13' })).status).toBe(401);
  });

  it('admin cannot demote/disable themselves or the last admin; reset-password issues a link', async () => {
    const adminPw = 'Admin-Password-2026!';
    const admin = await login(t, 'admin@example.com', adminPw, '12.12.12.12');
    const me = (await json(await req(t, 'GET', '/api/me', { cookie: admin }))).user;
    expect((await req(t, 'PATCH', `/api/admin/users/${me.id}`, { cookie: admin, body: { role: 'client' } })).status).toBe(403);
    expect((await req(t, 'PATCH', `/api/admin/users/${me.id}`, { cookie: admin, body: { status: 'disabled' } })).status).toBe(403);
    const list = await json(await req(t, 'GET', '/api/admin/users', { cookie: admin }));
    const client = list.find((u: any) => u.email === 'client1@example.com');
    const rp = await req(t, 'POST', `/api/admin/users/${client.id}/reset-password`, { cookie: admin });
    expect(rp.status).toBe(200);
    const url = (await json(rp)).inviteUrl as string;
    const token = url.split('/invite/')[1];
    const acc = await req(t, 'POST', '/api/auth/accept-invite', { body: { token, password: 'Reset-Password-2026!!', displayName: '' } });
    expect(acc.status).toBe(200);
    expect((await req(t, 'POST', '/api/auth/login', { body: { email: 'client1@example.com', password: 'Reset-Password-2026!!' }, ip: '12.12.12.13' })).status).toBe(200);
    // non-admin blocked from admin routes
    const c = await login(t, 'client1@example.com', 'Reset-Password-2026!!', '12.12.12.14');
    expect((await req(t, 'GET', '/api/admin/users', { cookie: c })).status).toBe(403);
    const audit = await req(t, 'GET', '/api/admin/audit?limit=5', { cookie: admin });
    expect(audit.status).toBe(200);
    const ab = await json(audit);
    expect(ab.entries.length).toBe(5);
    expect(ab.nextBefore).toBeTruthy();
    const page2 = await json(await req(t, 'GET', `/api/admin/audit?limit=5&before=${ab.nextBefore}`, { cookie: admin }));
    expect(Number(page2.entries[0].id)).toBeLessThan(Number(ab.entries[4].id));
  });
});
