/**
 * Plan storage: one current row per client in `plans`, every write appended to `plan_versions`.
 * State is encrypted with AAD plans:state_enc:<clientId> / plan_versions:state_enc:<clientId>:<version>.
 */
import { desc, eq, and } from 'drizzle-orm';
import type { PlanRecord, PlanVersionSummary } from '../../shared/api';
import { defaultPlanState, mergePlanState, type PlanState } from '../../shared/lib/inputs';
import type { AppDeps } from '../types';
import type { Db } from '../db/index';
import { planVersions, plans, users, type UserRow } from '../db/schema';
import { aad } from '../crypto';
import { usersByIds } from './users';

export const PLAN_AAD = (clientId: string) => aad('plans', 'state_enc', clientId);
export const PLAN_VERSION_AAD = (clientId: string, version: number) => aad('plan_versions', 'state_enc', `${clientId}:${version}`);

export interface CurrentPlan {
  version: number;
  state: PlanState;
  updatedAt: Date;
  updatedBy: string | null;
  /** false when the client has no plan row yet (virtual version 0 with defaults) */
  persisted: boolean;
}

export async function loadPlan(deps: Pick<AppDeps, 'db' | 'crypto'>, client: UserRow, db: Db = deps.db): Promise<CurrentPlan> {
  const [row] = await db.select().from(plans).where(eq(plans.clientId, client.id)).limit(1);
  if (!row) return { version: 0, state: defaultPlanState(), updatedAt: client.createdAt, updatedBy: null, persisted: false };
  let state: PlanState;
  try {
    state = mergePlanState(deps.crypto.decryptJson(row.stateEnc, PLAN_AAD(client.id)));
  } catch {
    // Undecryptable row (key rotation gone wrong): surface defaults rather than crash the UI.
    state = defaultPlanState();
  }
  return { version: row.version, state, updatedAt: row.updatedAt, updatedBy: row.updatedBy, persisted: true };
}

export async function toPlanRecord(db: Db, clientId: string, p: CurrentPlan): Promise<PlanRecord> {
  const byId = p.updatedBy ? await usersByIds(db, [p.updatedBy]) : new Map();
  return {
    clientId,
    version: p.version,
    state: p.state,
    updatedAt: p.updatedAt.toISOString(),
    updatedById: p.updatedBy,
    updatedByName: p.updatedBy ? (byId.get(p.updatedBy)?.displayName ?? null) : null,
  };
}

/** Write a new plan version (inside the caller's transaction when provided). Returns the new version number. */
export async function writePlan(
  deps: Pick<AppDeps, 'db' | 'crypto' | 'clock'>,
  input: { clientId: string; state: PlanState; actorId: string | null; reason: string },
  db: Db = deps.db,
): Promise<{ version: number; updatedAt: Date }> {
  const now = deps.clock.now();
  const [current] = await db.select({ version: plans.version }).from(plans).where(eq(plans.clientId, input.clientId)).limit(1);
  const version = (current?.version ?? 0) + 1;
  const enc = deps.crypto.encryptJson(input.state, PLAN_AAD(input.clientId));
  await db
    .insert(plans)
    .values({ clientId: input.clientId, version, stateEnc: enc, updatedAt: now, updatedBy: input.actorId })
    .onConflictDoUpdate({ target: plans.clientId, set: { version, stateEnc: enc, updatedAt: now, updatedBy: input.actorId } });
  await db.insert(planVersions).values({
    clientId: input.clientId,
    version,
    stateEnc: deps.crypto.encryptJson(input.state, PLAN_VERSION_AAD(input.clientId, version)),
    createdAt: now,
    createdBy: input.actorId,
    reason: input.reason,
  });
  return { version, updatedAt: now };
}

export async function listPlanVersions(db: Db, clientId: string): Promise<PlanVersionSummary[]> {
  const rows = await db
    .select({ version: planVersions.version, createdAt: planVersions.createdAt, reason: planVersions.reason, createdByName: users.displayName })
    .from(planVersions)
    .leftJoin(users, eq(users.id, planVersions.createdBy))
    .where(eq(planVersions.clientId, clientId))
    .orderBy(desc(planVersions.version));
  return rows.map((r) => ({ version: r.version, createdAt: r.createdAt.toISOString(), createdByName: r.createdByName ?? null, reason: r.reason }));
}

export async function loadPlanVersion(
  deps: Pick<AppDeps, 'db' | 'crypto'>,
  clientId: string,
  version: number,
): Promise<(PlanVersionSummary & { clientId: string; state: PlanState; createdById: string | null }) | null> {
  const [row] = await deps.db
    .select({
      version: planVersions.version,
      createdAt: planVersions.createdAt,
      reason: planVersions.reason,
      stateEnc: planVersions.stateEnc,
      createdBy: planVersions.createdBy,
      createdByName: users.displayName,
    })
    .from(planVersions)
    .leftJoin(users, eq(users.id, planVersions.createdBy))
    .where(and(eq(planVersions.clientId, clientId), eq(planVersions.version, version)))
    .limit(1);
  if (!row) return null;
  const state = mergePlanState(deps.crypto.decryptJson(row.stateEnc, PLAN_VERSION_AAD(clientId, version)));
  return {
    clientId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByName ?? null,
    createdById: row.createdBy,
    reason: row.reason,
    state,
  };
}
