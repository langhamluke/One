/**
 * Bootstrap (first start) and the demo seed. `npm run seed` runs the demo seed on demand.
 */
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { personasFor, seedClientsFor } from '../shared/data/personas';
import { productConfig } from '../shared/product';
import { mergePlanState, type PlanState } from '../shared/lib/inputs';
import type { Role } from '../shared/lib/types';
import type { AppDeps } from './types';
import { advisorClients, plans, proposals, users, type UserRow } from './db/schema';
import { hashPassword, passwordPolicyError } from './auth/password';
import { findUserByEmail, normalizeEmail } from './services/users';
import { writePlan } from './services/plans';
import { PROPOSAL_AAD } from './services/proposals';

export const DEMO = {
  advisor: { email: 'advisor@demo.basecase.local', password: 'BaseCase-Advisor-2026!', displayName: 'Demo Advisor' },
  clientPassword: 'BaseCase-Client-2026!',
  sampleProposalTitle: 'Try: raise 401(k) to 10%',
} as const;

/**
 * Demo staff accounts live on the product's demo domain (advisor@demo.flightplan.local for Flight Plan). There is no
 * demo admin: the real administrator comes from BOOTSTRAP_ADMIN_EMAIL/PASSWORD (or `npm run create-admin`).
 */
export function demoAccounts(product: string) {
  const domain = productConfig(product).demoDomain;
  return {
    advisor: { ...DEMO.advisor, email: `advisor@${domain}` },
  };
}

export interface EnsureUserInput {
  email: string;
  /** Omit to create an invited account with no password (the admin sends an invite link). */
  password?: string;
  role: Role;
  displayName: string;
}

/** Create an active user if the email is unknown; otherwise return the existing row unchanged. */
export async function ensureUser(deps: AppDeps, input: EnsureUserInput): Promise<{ user: UserRow; created: boolean }> {
  const existing = await findUserByEmail(deps.db, input.email);
  if (existing) return { user: existing, created: false };
  const now = deps.clock.now();
  const id = randomUUID();
  await deps.db.insert(users).values({
    id,
    email: normalizeEmail(input.email),
    passwordHash: input.password ? await hashPassword(input.password) : null,
    role: input.role,
    displayName: input.displayName,
    status: input.password ? 'active' : 'invited',
    createdAt: now,
    passwordChangedAt: input.password ? now : null,
  });
  const [user] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);
  return { user, created: true };
}

export async function assignAdvisor(deps: AppDeps, advisorId: string, clientId: string): Promise<void> {
  await deps.db.insert(advisorClients).values({ advisorId, clientId, createdAt: deps.clock.now() }).onConflictDoNothing();
}

export interface SeedResult {
  created: string[];
  credentials: { role: string; email: string; password: string; name: string }[];
}

/**
 * Idempotent demo seed: advisor, one client per persona (assigned to the advisor), one submitted proposal, plus the
 * product's real seed clients. No admin is created; seeded plans are written as the first existing admin (the
 * bootstrap admin) or, failing that, as the demo advisor.
 */
export async function runDemoSeed(deps: AppDeps, opts: { print?: boolean } = {}): Promise<SeedResult> {
  const created: string[] = [];
  const credentials: SeedResult['credentials'] = [];
  const accounts = demoAccounts(deps.config.product);
  const advisor = await ensureUser(deps, { ...accounts.advisor, role: 'advisor' });
  if (advisor.created) created.push(advisor.user.email);
  credentials.push({ role: 'advisor', email: advisor.user.email, password: DEMO.advisor.password, name: advisor.user.displayName });
  const [existingAdmin] = await deps.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  const actorId = existingAdmin?.id ?? advisor.user.id;

  let first: { user: UserRow; state: PlanState } | null = null;
  for (const persona of personasFor(deps.config.product)) {
    const res = await ensureUser(deps, { email: persona.email, password: DEMO.clientPassword, role: 'client', displayName: persona.name });
    if (res.created) created.push(res.user.email);
    if (res.user.role !== 'client') continue;
    credentials.push({ role: 'client', email: res.user.email, password: DEMO.clientPassword, name: res.user.displayName });
    await assignAdvisor(deps, advisor.user.id, res.user.id);
    const state = mergePlanState(persona.state);
    const [existingPlan] = await deps.db.select({ version: plans.version }).from(plans).where(eq(plans.clientId, res.user.id)).limit(1);
    if (!existingPlan) {
      await deps.db.transaction((tx) => writePlan(deps, { clientId: res.user.id, state, actorId, reason: 'seed' }, tx));
    }
    first ??= { user: res.user, state };
  }

  // Real clients (e.g. Flight Plan's Nick): account + starting plan, no password. The admin opens Users, sets the
  // real e-mail address, and sends the invite link; nothing is printed for them.
  for (const client of seedClientsFor(deps.config.product)) {
    const res = await ensureUser(deps, { email: client.email, role: 'client', displayName: client.name });
    if (res.created) created.push(res.user.email);
    if (res.user.role !== 'client') continue;
    await assignAdvisor(deps, advisor.user.id, res.user.id);
    const state = mergePlanState(client.state);
    const [existingPlan] = await deps.db.select({ version: plans.version }).from(plans).where(eq(plans.clientId, res.user.id)).limit(1);
    if (!existingPlan) {
      await deps.db.transaction((tx) => writePlan(deps, { clientId: res.user.id, state, actorId, reason: 'seed' }, tx));
    }
  }

  if (first) {
    const [existing] = await deps.db
      .select({ id: proposals.id })
      .from(proposals)
      .where(and(eq(proposals.clientId, first.user.id), eq(proposals.title, DEMO.sampleProposalTitle)))
      .limit(1);
    if (!existing) {
      const now = deps.clock.now();
      const id = randomUUID();
      const proposed: PlanState = { ...first.state, savings: { ...first.state.savings, deferralPct: 0.1 } };
      const [plan] = await deps.db.select({ version: plans.version }).from(plans).where(eq(plans.clientId, first.user.id)).limit(1);
      await deps.db.insert(proposals).values({
        id,
        clientId: first.user.id,
        authorId: first.user.id,
        title: DEMO.sampleProposalTitle,
        note: 'What happens if I raise my 401(k) deferral from the current rate to 10%?',
        status: 'submitted',
        stateEnc: deps.crypto.encryptJson(proposed, PROPOSAL_AAD(id)),
        baseVersion: plan?.version ?? 0,
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
      });
      created.push(`proposal:${DEMO.sampleProposalTitle}`);
    }
  }

  if (opts.print !== false) printCredentials(credentials, created.length, productConfig(deps.config.product).name);
  return { created, credentials };
}

export function printCredentials(credentials: SeedResult['credentials'], createdCount: number, productName = 'Base Case'): void {
  const title = ` ${productName} demo accounts `;
  const pad = Math.max(0, 85 - title.length);
  const lines = [
    '',
    `${'='.repeat(Math.floor(pad / 2))}${title}${'='.repeat(Math.ceil(pad / 2))}`,
    createdCount === 0 ? '(demo accounts already existed; nothing created)' : `(${createdCount} record(s) created)`,
    ...credentials.map((c) => `  ${c.role.padEnd(8)} ${c.email.padEnd(40)} ${c.password}   (${c.name})`),
    'These are LOCAL DEMO credentials. Rotate or delete them before any shared deployment.',
    '=====================================================================================',
    '',
  ];
  console.log(lines.join('\n'));
}

export async function userCount(deps: AppDeps): Promise<number> {
  const [row] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(users);
  return Number(row?.n ?? 0);
}

/** First-start bootstrap: with 0 users, create the bootstrap admin and/or the demo seed. */
export async function bootstrap(deps: AppDeps): Promise<void> {
  if ((await userCount(deps)) > 0) return;
  const { bootstrapAdminEmail, bootstrapAdminPassword, demoSeed } = deps.config;
  if (bootstrapAdminEmail && bootstrapAdminPassword) {
    const policy = passwordPolicyError(bootstrapAdminPassword, bootstrapAdminEmail);
    if (policy) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD rejected: ${policy}`);
    const res = await ensureUser(deps, { email: bootstrapAdminEmail, password: bootstrapAdminPassword, role: 'admin', displayName: 'Administrator' });
    deps.logger.info('bootstrap admin created', { userId: res.user.id });
  }
  if (demoSeed) {
    deps.logger.info('running demo seed (DEMO_SEED=1)');
    await runDemoSeed(deps);
    if (!bootstrapAdminEmail) deps.logger.warn('demo seed creates no admin: set BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD or run `npm run create-admin`');
  } else if (!bootstrapAdminEmail) {
    deps.logger.warn('no users exist: set BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD or run `npm run create-admin -- --email ... --password ...`');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { boot } = await import('./boot');
  const { deps, conn, logger } = await boot();
  try {
    const res = await runDemoSeed(deps);
    logger.info('seed complete', { created: res.created.length });
  } finally {
    await conn.close();
  }
}
