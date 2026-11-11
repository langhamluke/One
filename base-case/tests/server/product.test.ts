import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, login, makeApp, req, type TestApp } from './helpers';
import { DEMO, bootstrap, demoAccounts, runDemoSeed } from '../../server/seed';
import { PILOT_PERSONAS, PILOT_SEED_CLIENTS } from '../../shared/data/personasPilot';
import { PERSONAS } from '../../shared/data/personas';
import { configFromEnv } from '../../server/config';
import { buildPlanContext } from '../../server/services/planContext';
import { assistantName, systemPrompt } from '../../server/services/assistant';

const apps: TestApp[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});
async function app(product: 'base-case' | 'flight-plan') {
  const t = await makeApp({ config: { product, firmName: product === 'flight-plan' ? 'Flight Plan' : 'Test Firm' } });
  apps.push(t);
  return t;
}

describe('product configuration', () => {
  it('reads PRODUCT from the environment and defaults the firm name to the product', () => {
    const fp = configFromEnv({ PRODUCT: 'flight-plan', BASE_CASE_MASTER_KEY: 'a'.repeat(64) } as NodeJS.ProcessEnv);
    expect(fp.product).toBe('flight-plan');
    expect(fp.firmName).toBe('Flight Plan');
    const named = configFromEnv({ PRODUCT: 'flight-plan', FIRM_NAME: 'Langham Advisors' } as NodeJS.ProcessEnv);
    expect(named.firmName).toBe('Langham Advisors');
    const bc = configFromEnv({} as NodeJS.ProcessEnv);
    expect(bc.product).toBe('base-case');
    expect(bc.firmName).toBe('Base Case');
  });

  it('serves GET /api/product without a session and stamps the product on /api/me', async () => {
    const t = await app('flight-plan');
    const pub = await req(t, 'GET', '/api/product', { noCsrf: true });
    expect(pub.status).toBe(200);
    expect(await json(pub)).toEqual({ key: 'flight-plan', name: 'Flight Plan', tagline: 'Financial planning for airline pilots', firmName: 'Flight Plan' });
    const health = await json(await req(t, 'GET', '/api/health', { noCsrf: true }));
    expect(health.product).toBe('flight-plan');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runDemoSeed(t.deps, { print: false });
    const accounts = demoAccounts('flight-plan');
    expect(accounts.advisor.email).toBe('advisor@demo.flightplan.local');
    expect('admin' in accounts).toBe(false);
    const cookie = await login(t, accounts.advisor.email, DEMO.advisor.password, '42.1.0.1');
    const me = await json(await req(t, 'GET', '/api/me', { cookie }));
    expect(me.firm.product).toBe('flight-plan');
    expect(me.firm.name).toBe('Flight Plan');

    const bc = await app('base-case');
    expect((await json(await req(bc, 'GET', '/api/product', { noCsrf: true }))).key).toBe('base-case');
  });

  it('seeds pilot personas on a Flight Plan instance and graduate personas on Base Case', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fp = await app('flight-plan');
    const r = await runDemoSeed(fp.deps, { print: false });
    expect(r.credentials.filter((c) => c.role === 'client').map((c) => c.email).sort()).toEqual(PILOT_PERSONAS.map((p) => p.email).sort());
    const advisor = await login(fp, demoAccounts('flight-plan').advisor.email, DEMO.advisor.password, '42.1.0.2');
    const clients = await json(await req(fp, 'GET', '/api/clients', { cookie: advisor }));
    expect(clients.length).toBe(PILOT_PERSONAS.length + PILOT_SEED_CLIENTS.length);
    const nick = clients.find((c: { email: string }) => c.email === PILOT_SEED_CLIENTS[0].email);
    expect(nick).toBeDefined();
    const nickPlan = await json(await req(fp, 'GET', `/api/plans/${nick.id}`, { cookie: advisor }));
    expect(nickPlan.state.profile.nickname).toBe('Nick');
    expect(nick.status).toBe('invited');
    const jordan = clients.find((c: { email: string }) => c.email === PILOT_PERSONAS[0].email);
    const plan = await json(await req(fp, 'GET', `/api/plans/${jordan.id}`, { cookie: advisor }));
    expect(plan.state.product).toBe('flight-plan');
    expect(plan.state.profile.pilot.stage).toBe('cfi');
    expect(plan.state.careerPaths[0].kind).toBe('airline');

    const bc = await app('base-case');
    const r2 = await runDemoSeed(bc.deps, { print: false });
    expect(r2.credentials.filter((c) => c.role === 'client').map((c) => c.email).sort()).toEqual(PERSONAS.map((p) => p.email).sort());
  });

  it('gives the assistant a pilot-aware prompt and name for pilot plans', () => {
    const ctx = buildPlanContext(PILOT_PERSONAS[0].state);
    expect(ctx.product).toBe('flight-plan');
    expect(ctx.dataAsOf.airlines).toBeTruthy();
    const prompt = systemPrompt(ctx, 'Flight Plan');
    expect(prompt).toContain('Flight Plan Assistant');
    expect(prompt).toContain('airline pay scales');
    expect(prompt).toContain('FAA age limit of 65');
    expect(assistantName('base-case')).toBe('Base Case Assistant');
    const bc = buildPlanContext(PERSONAS[0].state);
    expect(bc.product).toBe('base-case');
    expect(systemPrompt(bc, 'Test Firm')).not.toContain('airline');
  });
});

describe('production bootstrap with real clients', () => {
  it('creates the admin and the configured real clients only, no demo accounts', async () => {
    const t = await makeApp({ config: {
      product: 'flight-plan', demoSeed: false,
      bootstrapAdminEmail: 'luke@example.com', bootstrapAdminPassword: 'Correct-Horse-Battery-9',
      seedClientEmails: { [PILOT_SEED_CLIENTS[0].key]: 'nick@example.com' },
    } });
    try {
      await bootstrap(t.deps);
      const { users } = await import('../../server/db/schema');
      const rows = await t.deps.db.select({ email: users.email, role: users.role, status: users.status }).from(users);
      expect(rows.map((r) => `${r.role}:${r.email}:${r.status}`).sort()).toEqual(['admin:luke@example.com:active', 'client:nick@example.com:invited']);
      const admin = await login(t, 'luke@example.com', 'Correct-Horse-Battery-9', '42.1.0.9');
      const nick = rows.find((r) => r.email === 'nick@example.com')!;
      const clients = await json(await req(t, 'GET', '/api/clients', { cookie: admin }));
      const plan = await json(await req(t, 'GET', `/api/plans/${clients.find((c: { email: string }) => c.email === nick.email).id}`, { cookie: admin }));
      expect(plan.state.profile.nickname).toBe('Nick');
      await bootstrap(t.deps); // second start: nothing new
      expect((await t.deps.db.select({ email: users.email }).from(users)).length).toBe(2);
    } finally {
      await t.close();
    }
  });
});
