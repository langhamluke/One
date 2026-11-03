/**
 * /api/clients (advisor/admin)
 */
import { Hono } from 'hono';
import { eq, inArray, sql } from 'drizzle-orm';
import type { ClientDetail, ClientListItem } from '../../shared/api';
import type { AppDeps, AppEnv } from '../types';
import { plans, users } from '../db/schema';
import { actorOf, requireAuth, requireRole } from '../auth/middleware';
import { audit } from '../services/audit';
import { assignmentsFor, requireClientAccess, usersByIds, userSummary, visibleClientIds } from '../services/users';
import { loadPlan, toPlanRecord } from '../services/plans';
import { listProposals, pendingCounts, proposalSummaries } from '../services/proposals';

export function clientRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth, requireRole('admin', 'advisor'));

  app.get('/', async (c) => {
    const actor = actorOf(c);
    const visible = await visibleClientIds(deps.db, actor);
    const where = visible === 'all' ? eq(users.role, 'client') : visible.length ? inArray(users.id, visible) : sql`false`;
    const rows = await deps.db.select().from(users).where(where).orderBy(users.displayName);
    const ids = rows.map((r) => r.id);
    const planRows = ids.length ? await deps.db.select({ clientId: plans.clientId, version: plans.version, updatedAt: plans.updatedAt }).from(plans).where(inArray(plans.clientId, ids)) : [];
    const planById = new Map(planRows.map((p) => [p.clientId, p]));
    const pending = await pendingCounts(deps.db, ids);
    const { advisorsOf } = await assignmentsFor(deps.db, ids);
    const advisorIds = [...new Set([...advisorsOf.values()].flat())];
    const advisors = await usersByIds(deps.db, advisorIds);
    const out: ClientListItem[] = rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      status: u.status,
      planVersion: planById.get(u.id)?.version ?? 0,
      planUpdatedAt: planById.get(u.id)?.updatedAt.toISOString() ?? null,
      pendingProposals: pending.get(u.id) ?? 0,
      advisorNames: (advisorsOf.get(u.id) ?? []).map((id) => advisors.get(id)?.displayName ?? '').filter(Boolean),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    }));
    return c.json(out);
  });

  app.get('/:id', async (c) => {
    const actor = actorOf(c);
    const { client } = await requireClientAccess(deps.db, actor, c.req.param('id'));
    const plan = await loadPlan(deps, client);
    const proposals = await listProposals(deps.db, { clientIds: [client.id] });
    await audit(deps, { actorId: actor.id, action: 'plan.read', targetType: 'plan', targetId: client.id, ip: c.get('ip'), metadata: { version: plan.version, via: 'client-detail' } });
    const res: ClientDetail = {
      client: await userSummary(deps.db, client),
      plan: plan.persisted ? await toPlanRecord(deps.db, client.id, plan) : null,
      proposals: await proposalSummaries(deps.db, proposals),
    };
    return c.json(res);
  });

  return app;
}
