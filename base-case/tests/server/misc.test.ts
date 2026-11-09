import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeApp, createUser, req, login, json, type TestApp } from './helpers';
import { validatePlanState, deepCheckLimits } from '../../server/validation/planState';
import { defaultPlanState } from '../../shared/lib/inputs';
import { canAccessClient, canEditPlanDirectly, proposalPermissions, canChangeUser } from '../../server/auth/authorize';
import { dataStatus, monthsOld } from '../../server/services/dataStatus';
import { parseDotEnv } from '../../server/env';
import { runDemoSeed, DEMO } from '../../server/seed';
import { PERSONAS } from '../../shared/data/personas';
import { TokenBucketLimiter } from '../../server/auth/rateLimit';
import { sanitizeMetadata } from '../../server/services/audit';

const PW = 'Misc-Password-2026!';

describe('data status, security headers, settings', () => {
  let t: TestApp;
  let client: string;
  let admin: string;
  beforeAll(async () => {
    t = await makeApp();
    await createUser(t, { email: 'c@s.test', password: PW, role: 'client' });
    await createUser(t, { email: 'adm@s.test', password: PW, role: 'admin' });
    client = await login(t, 'c@s.test', PW, '40.0.0.1');
    admin = await login(t, 'adm@s.test', PW, '40.0.0.2');
  });
  afterAll(() => t.close());

  it('GET /api/data/status reports as-of dates and counts', async () => {
    expect((await req(t, 'GET', '/api/data/status')).status).toBe(401);
    const r = await req(t, 'GET', '/api/data/status', { cookie: client });
    expect(r.status).toBe(200);
    const b = await json(r);
    expect(b.asOf).toEqual({ irs: '2025-11', tax: '2026', wages: '2025-05', loans: '2026-07', ssa: '2026-10' });
    expect(b.totalCount).toBeGreaterThan(5);
    expect(b.unverifiedCount).toBeGreaterThanOrEqual(1);
    expect(b.unverifiedCount).toBeLessThanOrEqual(b.totalCount);
    expect(b.staleCount).toBeLessThanOrEqual(b.totalCount);
    const pure = dataStatus(new Date('2026-11-03T00:00:00Z'));
    expect(pure.totalCount).toBe(b.totalCount);
    expect(monthsOld('2025-10', new Date('2026-11-03T00:00:00Z'))).toBe(13);
    expect(monthsOld('2026-05', new Date('2026-11-03T00:00:00Z'))).toBe(6);
  });

  it('security headers are present on every response and /api is no-store', async () => {
    for (const res of [await req(t, 'GET', '/api/health', { noCsrf: true }), await req(t, 'GET', '/nope', { noCsrf: true }), await req(t, 'GET', '/api/me')]) {
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('permissions-policy')).toContain('camera=()');
      expect(res.headers.get('x-request-id')).toBeTruthy();
      expect(res.headers.get('strict-transport-security')).toBeNull(); // http origin in tests
    }
    expect((await req(t, 'GET', '/api/health', { noCsrf: true })).headers.get('cache-control')).toBe('no-store');
  });

  it('HSTS is set when APP_ORIGIN is https', async () => {
    const s = await makeApp({ config: { appOrigin: 'https://app.example.com' } });
    try {
      const r = await s.app.request('https://app.example.com/api/health');
      expect(r.headers.get('strict-transport-security')).toContain('max-age=');
    } finally {
      await s.close();
    }
  });

  it('settings default and update with audit', async () => {
    const s = await json(await req(t, 'GET', '/api/admin/settings', { cookie: admin }));
    expect(s).toMatchObject({ firmName: 'Test Firm', assistantEnabled: true, inviteExpiryHours: 72, sessionHours: 12, requireMfaForStaff: false });
    expect(s.disclaimer).toMatch(/not investment, tax, or legal advice/);
    const u = await json(await req(t, 'PATCH', '/api/admin/settings', { cookie: admin, body: { firmName: 'Acme Advisors', sessionHours: 2 } }));
    expect(u.firmName).toBe('Acme Advisors');
    expect(u.sessionHours).toBe(2);
    expect((await req(t, 'PATCH', '/api/admin/settings', { cookie: admin, body: { sessionHours: 0 } })).status).toBe(400);
    expect((await req(t, 'PATCH', '/api/admin/settings', { cookie: admin, body: { bogus: 1 } })).status).toBe(400);
    expect((await json(await req(t, 'GET', '/api/me', { cookie: client }))).firm.name).toBe('Acme Advisors');
    expect((await req(t, 'GET', '/api/admin/settings', { cookie: client })).status).toBe(403);
  });

  it('rejects oversized bodies, invalid JSON and unknown API routes with JSON', async () => {
    const big = await req(t, 'PUT', '/api/plans/x', { cookie: admin, body: 'x'.repeat(600 * 1024) });
    expect(big.status).toBe(413);
    const bad = await req(t, 'POST', '/api/proposals', { cookie: client, body: '{not json' });
    expect(bad.status).toBe(400);
    const unk = await req(t, 'GET', '/api/does-not-exist', { cookie: client });
    expect(unk.status).toBe(404);
    expect((await json(unk)).error).toBe('Not found');
  });
});

describe('plan state validation', () => {
  it('accepts defaults and partial states, hydrating via mergePlanState', () => {
    const full = validatePlanState(defaultPlanState());
    expect(full.careerPaths.length).toBe(1);
    const partial = validatePlanState({ profile: { nickname: 'Pat' } });
    expect(partial.profile.nickname).toBe('Pat');
    expect(partial.profile.age).toBe(22);
  });

  it('rejects NaN / Infinity, huge numbers, long strings, big arrays and wrong types', () => {
    const s = defaultPlanState();
    expect(() => validatePlanState({ ...s, profile: { ...s.profile, age: NaN } })).toThrow(/finite/);
    expect(() => validatePlanState({ ...s, profile: { ...s.profile, age: Infinity } })).toThrow(/finite/);
    expect(() => validatePlanState({ ...s, balanceSheet: { ...s.balanceSheet, cash: 5e9 } })).toThrow(/range/);
    expect(() => validatePlanState({ ...s, notes: 'x'.repeat(2001) })).toThrow(/too long/);
    expect(() => validatePlanState({ ...s, debts: Array.from({ length: 51 }, (_, i) => ({ id: `d${i}`, name: 'd', kind: 'other', balance: 1, rate: 0.1 })) })).toThrow(/array too long/);
    expect(() => validatePlanState({ ...s, profile: { ...s.profile, age: '22' } })).toThrow(/profile.age/);
    expect(() => validatePlanState({ ...s, savings: { ...s.savings, deferralType: 'maybe' } })).toThrow(/deferralType/);
    expect(() => validatePlanState({ ...s, extra: { deep: { v: NaN } } })).toThrow(/finite/);
    expect(() => validatePlanState([1, 2])).toThrow(/object/);
    expect(deepCheckLimits({ a: [1, 2, 'x'.repeat(2001)] })).toMatch(/string too long/);
    expect(deepCheckLimits(JSON.parse('{"__proto__": {"polluted": true}}'))).toMatch(/forbidden key/);
    expect(() => validatePlanState({ ...s, careerPaths: [null] })).toThrow(/Invalid plan state/);
  });

  it('rejects huge arrays over HTTP with 400', async () => {
    const t = await makeApp();
    try {
      await createUser(t, { email: 'adm@v.test', password: PW, role: 'admin' });
      const cId = await createUser(t, { email: 'c@v.test', password: PW, role: 'client' });
      const admin = await login(t, 'adm@v.test', PW, '41.0.0.1');
      const s = defaultPlanState();
      const r = await req(t, 'PUT', `/api/plans/${cId}`, { cookie: admin, body: { ...s, goals: Array.from({ length: 51 }, (_, i) => ({ id: `g${i}`, name: 'g', kind: 'other', targetAmount: 1, targetYear: 2030, priority: 1, fundedSoFar: 0 })) } });
      expect(r.status).toBe(400);
      expect((await json(r)).code).toBe('invalid_plan');
      const r2 = await req(t, 'PUT', `/api/plans/${cId}`, { cookie: admin, body: { ...s, profile: { ...s.profile, livingExpenses: 1e12 } } });
      expect(r2.status).toBe(400);
    } finally {
      await t.close();
    }
  });
});

describe('authorize (pure)', () => {
  const admin = { id: 'adm', role: 'admin' as const };
  const adv = { id: 'adv', role: 'advisor' as const };
  const other = { id: 'adv2', role: 'advisor' as const };
  const client = { id: 'cli', role: 'client' as const };
  it('client access', () => {
    expect(canAccessClient(client, 'cli', [])).toBe(true);
    expect(canAccessClient(client, 'cli2', [])).toBe(false);
    expect(canAccessClient(adv, 'cli', ['adv'])).toBe(true);
    expect(canAccessClient(other, 'cli', ['adv'])).toBe(false);
    expect(canAccessClient(admin, 'cli', [])).toBe(true);
    expect(canEditPlanDirectly(client, 'cli', ['adv'])).toBe(false);
    expect(canEditPlanDirectly(adv, 'cli', ['adv'])).toBe(true);
    expect(canEditPlanDirectly(other, 'cli', ['adv'])).toBe(false);
    expect(canEditPlanDirectly(admin, 'cli', [])).toBe(true);
  });
  it('proposal permissions (four-eyes)', () => {
    const p = { clientId: 'cli', authorId: 'cli', status: 'submitted' as const };
    expect(proposalPermissions(client, p, ['adv'])).toMatchObject({ view: true, approve: false, reject: false, withdraw: true, edit: false });
    expect(proposalPermissions(adv, p, ['adv'])).toMatchObject({ view: true, approve: true, reject: true, withdraw: true });
    expect(proposalPermissions(other, p, ['adv'])).toMatchObject({ view: false, approve: false });
    expect(proposalPermissions(admin, p, [])).toMatchObject({ approve: true });
    const byAdv = { clientId: 'cli', authorId: 'adv', status: 'submitted' as const };
    expect(proposalPermissions(adv, byAdv, ['adv']).approve).toBe(false);
    expect(proposalPermissions(admin, byAdv, ['adv']).approve).toBe(true);
    expect(proposalPermissions(client, byAdv, ['adv'])).toMatchObject({ view: true, approve: false, withdraw: false, edit: false });
    const draft = { clientId: 'cli', authorId: 'cli', status: 'draft' as const };
    expect(proposalPermissions(client, draft, ['adv'])).toMatchObject({ edit: true, submit: true, delete: true, approve: false });
    expect(proposalPermissions(adv, draft, ['adv'])).toMatchObject({ edit: true, submit: true, approve: false });
    const approved = { ...draft, status: 'approved' as const };
    expect(proposalPermissions(admin, approved, [])).toMatchObject({ edit: false, delete: false, approve: false });
  });
  it('admin self/last-admin protection', () => {
    const me = { id: 'adm', role: 'admin' as const, status: 'active' as const };
    expect(canChangeUser(admin, me, { role: 'advisor' }, 3).ok).toBe(false);
    expect(canChangeUser(admin, me, { status: 'disabled' }, 3).ok).toBe(false);
    expect(canChangeUser(admin, me, {}, 3).ok).toBe(true);
    const otherAdmin = { id: 'adm2', role: 'admin' as const, status: 'active' as const };
    expect(canChangeUser(admin, otherAdmin, { role: 'advisor' }, 1).ok).toBe(false);
    expect(canChangeUser(admin, otherAdmin, { role: 'advisor' }, 2).ok).toBe(true);
    expect(canChangeUser(adv, otherAdmin, { role: 'advisor' }, 2).ok).toBe(false);
  });
});

describe('small utilities', () => {
  it('.env parser', () => {
    expect(parseDotEnv('# c\nA=1\nexport B="two words"\nC=\'x\' # comment\nD=val # trailing\nbad line\n')).toEqual({ A: '1', B: 'two words', C: 'x', D: 'val' });
  });
  it('token bucket', () => {
    const l = new TokenBucketLimiter({ max: 2, windowMs: 1000 });
    expect(l.hit('k', 0).allowed).toBe(true);
    expect(l.hit('k', 0).allowed).toBe(true);
    const d = l.hit('k', 0);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSec).toBe(1);
    expect(l.hit('k', 600).allowed).toBe(true);
    l.reset();
    expect(l.hit('k', 600).remaining).toBe(1);
  });
  it('audit metadata never carries plan contents or emails', () => {
    expect(sanitizeMetadata({ state: { x: 1 }, email: 'a@b', plan: {}, version: 3, keys: ['a'] })).toEqual({ version: 3, keys: ['a'] });
  });
});

describe('demo seed', () => {
  it('creates advisor and persona clients with plans and a submitted proposal, no admin; idempotent; prints credentials', async () => {
    const t = await makeApp();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const r1 = await runDemoSeed(t.deps);
      expect(r1.created.length).toBeGreaterThanOrEqual(3);
      expect(r1.credentials.some((c) => c.role === 'admin')).toBe(false);
      expect(log).toHaveBeenCalled();
      expect(String(log.mock.calls[0][0])).toContain(DEMO.advisor.email);
      expect(String(log.mock.calls[0][0])).toContain(DEMO.advisor.password);
      expect(String(log.mock.calls[0][0])).not.toMatch(/admin/i);
      const r2 = await runDemoSeed(t.deps, { print: false });
      expect(r2.created).toEqual([]);
      const advisor = await login(t, DEMO.advisor.email, DEMO.advisor.password, '42.0.0.1');
      const clients = await json(await req(t, 'GET', '/api/clients', { cookie: advisor }));
      expect(clients.length).toBe(PERSONAS.length);
      for (const c of clients) expect(c.planVersion).toBe(1);
      const first = clients.find((c: any) => c.email === PERSONAS[0].email);
      expect(first.pendingProposals).toBe(1);
      const props = await json(await req(t, 'GET', '/api/proposals?status=submitted', { cookie: advisor }));
      expect(props.length).toBe(1);
      expect(props[0].title).toBe(DEMO.sampleProposalTitle);
      expect(props[0].clientId).toBe(first.id);
      const client = await login(t, first.email, DEMO.clientPassword, '42.0.0.2');
      expect((await json(await req(t, 'GET', '/api/plans/me', { cookie: client }))).version).toBe(1);
      const admins = await t.deps.db.select().from((await import('../../server/db/schema')).users);
      expect(admins.filter((u) => u.role === 'admin')).toEqual([]);
    } finally {
      log.mockRestore();
      await t.close();
    }
  });
});

describe('seed client e-mail override', () => {
  it('parses SEED_CLIENT_EMAILS and the seed uses it for the matching persona key', async () => {
    const { parseSeedClientEmails } = await import('../../server/config');
    expect(parseSeedClientEmails('student=Nick@Example.com, bogus, x=notanemail')).toEqual({ student: 'nick@example.com' });
    expect(parseSeedClientEmails(null)).toEqual({});
    const { PILOT_SEED_CLIENTS } = await import('../../shared/data/personasPilot');
    const t = await makeApp({ config: { product: 'flight-plan', seedClientEmails: { [PILOT_SEED_CLIENTS[0].key]: 'nick@example.com' } } });
    try {
      await runDemoSeed(t.deps, { print: false });
      const { users } = await import('../../server/db/schema');
      const rows = await t.deps.db.select({ email: users.email, status: users.status }).from(users);
      expect(rows.some((r) => r.email === 'nick@example.com' && r.status === 'invited')).toBe(true);
      expect(rows.some((r) => r.email === PILOT_SEED_CLIENTS[0].email)).toBe(false);
    } finally {
      await t.close();
    }
  });
});
