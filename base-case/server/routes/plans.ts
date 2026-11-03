/**
 * /api/plans/*
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { PlanRecord } from '../../shared/api';
import type { AppDeps, AppEnv } from '../types';
import { badRequest, forbidden, notFound } from '../errors';
import { actorOf, currentUser, requireAuth } from '../auth/middleware';
import { canEditPlanDirectly } from '../auth/authorize';
import { audit } from '../services/audit';
import { requireClientAccess } from '../services/users';
import { listPlanVersions, loadPlan, loadPlanVersion, toPlanRecord, writePlan } from '../services/plans';
import { validatePlanState } from '../validation/planState';
import { parseJson } from './util';

/** Accept either a raw PlanState or `{ state: PlanState, reason?: string }`. */
export function extractPlanBody(raw: unknown): { state: unknown; reason: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.state && typeof o.state === 'object' && o.profile === undefined) {
      const reason = typeof o.reason === 'string' ? o.reason.slice(0, 200) : '';
      return { state: o.state, reason };
    }
  }
  return { state: raw, reason: '' };
}

export function planRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/me', async (c) => {
    const user = currentUser(c);
    if (user.role !== 'client') throw notFound('No plan for this account; staff accounts view client plans via /api/plans/:clientId');
    const plan = await loadPlan(deps, user);
    const res: PlanRecord = await toPlanRecord(deps.db, user.id, plan);
    return c.json(res);
  });

  app.get('/:clientId', async (c) => {
    const actor = actorOf(c);
    const { client } = await requireClientAccess(deps.db, actor, c.req.param('clientId'));
    const plan = await loadPlan(deps, client);
    if (actor.role !== 'client') {
      await audit(deps, { actorId: actor.id, action: 'plan.read', targetType: 'plan', targetId: client.id, ip: c.get('ip'), metadata: { version: plan.version } });
    }
    return c.json(await toPlanRecord(deps.db, client.id, plan));
  });

  app.put('/:clientId', async (c) => {
    const actor = actorOf(c);
    const { client, advisorIds } = await requireClientAccess(deps.db, actor, c.req.param('clientId'));
    if (!canEditPlanDirectly(actor, client.id, advisorIds)) throw forbidden('Clients propose changes; direct plan edits are for your advisor', 'direct_edit_forbidden');
    const { state: rawState, reason } = extractPlanBody(await parseJson(c));
    const state = validatePlanState(rawState);
    const { version } = await deps.db.transaction(async (tx) => writePlan(deps, { clientId: client.id, state, actorId: actor.id, reason: reason ? `direct-edit: ${reason}` : 'direct-edit' }, tx));
    await audit(deps, { actorId: actor.id, action: 'plan.write', targetType: 'plan', targetId: client.id, ip: c.get('ip'), metadata: { version, reason: 'direct-edit' } });
    const plan = await loadPlan(deps, client);
    return c.json(await toPlanRecord(deps.db, client.id, plan));
  });

  app.get('/:clientId/versions', async (c) => {
    const actor = actorOf(c);
    const { client } = await requireClientAccess(deps.db, actor, c.req.param('clientId'));
    return c.json(await listPlanVersions(deps.db, client.id));
  });

  app.get('/:clientId/versions/:version', async (c) => {
    const actor = actorOf(c);
    const { client } = await requireClientAccess(deps.db, actor, c.req.param('clientId'));
    const v = z.coerce.number().int().min(1).safeParse(c.req.param('version'));
    if (!v.success) throw badRequest('Invalid version');
    const row = await loadPlanVersion(deps, client.id, v.data);
    if (!row) throw notFound('Version not found');
    if (actor.role !== 'client') {
      await audit(deps, { actorId: actor.id, action: 'plan.read', targetType: 'plan', targetId: client.id, ip: c.get('ip'), metadata: { version: row.version, via: 'version' } });
    }
    return c.json(row);
  });

  return app;
}
