/**
 * /api/proposals/*
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ProposalStatus } from '../../shared/api';
import type { AppDeps, AppEnv } from '../types';
import { proposals, type ProposalRow } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { actorOf, requireAuth, type AppContext } from '../auth/middleware';
import { proposalPermissions, type ProposalPermissions } from '../auth/authorize';
import { audit, type AuditAction } from '../services/audit';
import { advisorIdsOf, requireClientAccess, visibleClientIds } from '../services/users';
import { loadPlan, writePlan } from '../services/plans';
import { PROPOSAL_AAD, decryptProposalState, findProposal, listProposals, proposalSummaries, toProposal } from '../services/proposals';
import { validatePlanState } from '../validation/planState';
import { parseJson } from './util';

const STATUSES: ProposalStatus[] = ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'];

export function proposalRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  /** Load a proposal the actor may view (404 otherwise) with its permissions. */
  const loadVisible = async (c: AppContext, id: string): Promise<{ row: ProposalRow; perms: ProposalPermissions; advisorIds: string[] }> => {
    const actor = actorOf(c);
    if (!z.string().uuid().safeParse(id).success) throw notFound('Proposal not found');
    const row = await findProposal(deps.db, id);
    if (!row) throw notFound('Proposal not found');
    const advisorIds = await advisorIdsOf(deps.db, row.clientId);
    const perms = proposalPermissions(actor, { clientId: row.clientId, authorId: row.authorId, status: row.status as ProposalStatus }, advisorIds);
    if (!perms.view) throw notFound('Proposal not found');
    return { row, perms, advisorIds };
  };

  app.get('/', async (c) => {
    const actor = actorOf(c);
    const status = c.req.query('status');
    const clientId = c.req.query('clientId');
    if (status && !STATUSES.includes(status as ProposalStatus)) return c.json([]);
    let clientIds: string[] | 'all';
    if (clientId) {
      const { client } = await requireClientAccess(deps.db, actor, clientId);
      clientIds = [client.id];
    } else {
      clientIds = await visibleClientIds(deps.db, actor);
    }
    const rows = await listProposals(deps.db, { clientIds, status: status as ProposalStatus | undefined });
    return c.json(await proposalSummaries(deps.db, rows));
  });

  app.post('/', async (c) => {
    const actor = actorOf(c);
    const raw = (await parseJson(c)) as Record<string, unknown>;
    const meta = z
      .object({ clientId: z.string().uuid().optional(), title: z.string().trim().min(1).max(200), note: z.string().max(2000).optional().default('') })
      .safeParse(raw);
    if (!meta.success) {
      const issue = meta.error.issues[0];
      throw badRequest(`Invalid request: ${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`, 'invalid_body');
    }
    const clientId = meta.data.clientId ?? (actor.role === 'client' ? actor.id : undefined);
    if (!clientId) throw badRequest('clientId is required for staff-created proposals', 'client_required');
    const { client } = await requireClientAccess(deps.db, actor, clientId);
    const base = await loadPlan(deps, client);
    const state = raw.state !== undefined ? validatePlanState(raw.state) : base.state;
    const now = deps.clock.now();
    const id = randomUUID();
    await deps.db.insert(proposals).values({
      id,
      clientId: client.id,
      authorId: actor.id,
      title: meta.data.title,
      note: meta.data.note,
      status: 'draft',
      stateEnc: deps.crypto.encryptJson(state, PROPOSAL_AAD(id)),
      baseVersion: base.version,
      createdAt: now,
      updatedAt: now,
    });
    await audit(deps, { actorId: actor.id, action: 'proposal.created', targetType: 'proposal', targetId: id, ip: c.get('ip'), metadata: { clientId: client.id, baseVersion: base.version } });
    const row = await findProposal(deps.db, id);
    return c.json(await toProposal(deps, row!), 201);
  });

  app.get('/:id', async (c) => {
    const { row } = await loadVisible(c, c.req.param('id'));
    return c.json(await toProposal(deps, row));
  });

  app.put('/:id', async (c) => {
    const actor = actorOf(c);
    const { row, perms } = await loadVisible(c, c.req.param('id'));
    if (!perms.edit) {
      if (row.status !== 'draft' && row.status !== 'rejected') throw conflict(`Proposal is ${row.status} and can no longer be edited`, 'invalid_state');
      throw forbidden('You cannot edit this proposal');
    }
    const raw = (await parseJson(c)) as Record<string, unknown>;
    const meta = z.object({ title: z.string().trim().min(1).max(200).optional(), note: z.string().max(2000).optional() }).safeParse(raw);
    if (!meta.success) throw badRequest('Invalid title or note', 'invalid_body');
    const patch: Partial<typeof proposals.$inferInsert> = { updatedAt: deps.clock.now(), status: 'draft' };
    if (meta.data.title !== undefined) patch.title = meta.data.title;
    if (meta.data.note !== undefined) patch.note = meta.data.note;
    if (raw.state !== undefined) patch.stateEnc = deps.crypto.encryptJson(validatePlanState(raw.state), PROPOSAL_AAD(row.id));
    if (row.status === 'rejected') {
      patch.reviewNote = null;
      patch.reviewerId = null;
      patch.reviewedAt = null;
    }
    await deps.db.update(proposals).set(patch).where(eq(proposals.id, row.id));
    await audit(deps, { actorId: actor.id, action: 'proposal.updated', targetType: 'proposal', targetId: row.id, ip: c.get('ip'), metadata: { clientId: row.clientId, stateChanged: raw.state !== undefined } });
    return c.json(await toProposal(deps, (await findProposal(deps.db, row.id))!));
  });

  const transition = async (
    c: AppContext,
    id: string,
    key: keyof ProposalPermissions,
    from: ProposalStatus[],
    to: ProposalStatus,
    action: AuditAction,
    extra: (row: ProposalRow) => Promise<Partial<typeof proposals.$inferInsert>>,
  ) => {
    const actor = actorOf(c);
    const { row, perms } = await loadVisible(c, id);
    if (!perms[key]) {
      if (!from.includes(row.status as ProposalStatus)) throw conflict(`Proposal is ${row.status}; expected ${from.join(' or ')}`, 'invalid_state');
      if ((key === 'approve' || key === 'reject') && row.authorId === actor.id) throw forbidden('You cannot review your own proposal', 'self_review');
      throw forbidden(`You cannot ${key} this proposal`);
    }
    const now = deps.clock.now();
    const patch = { ...(await extra(row)), status: to, updatedAt: now };
    await deps.db.update(proposals).set(patch).where(eq(proposals.id, row.id));
    await audit(deps, { actorId: actor.id, action, targetType: 'proposal', targetId: row.id, ip: c.get('ip'), metadata: { clientId: row.clientId, from: row.status, to } });
    return c.json(await toProposal(deps, (await findProposal(deps.db, row.id))!));
  };

  app.post('/:id/submit', (c) => transition(c, c.req.param('id'), 'submit', ['draft'], 'submitted', 'proposal.submitted', async () => ({ submittedAt: deps.clock.now() })));

  app.post('/:id/withdraw', (c) => transition(c, c.req.param('id'), 'withdraw', ['submitted'], 'withdrawn', 'proposal.withdrawn', async () => ({})));

  app.post('/:id/reject', async (c) => {
    const body = z.object({ note: z.string().max(2000).optional().default('') }).safeParse(await parseJson(c));
    const note = body.success ? body.data.note : '';
    const actor = actorOf(c);
    return transition(c, c.req.param('id'), 'reject', ['submitted'], 'rejected', 'proposal.rejected', async () => ({ reviewNote: note, reviewerId: actor.id, reviewedAt: deps.clock.now() }));
  });

  app.post('/:id/approve', async (c) => {
    const body = z.object({ note: z.string().max(2000).optional().default('') }).safeParse(await parseJson(c));
    const note = body.success ? body.data.note : '';
    const actor = actorOf(c);
    const { row, perms } = await loadVisible(c, c.req.param('id'));
    if (!perms.approve) {
      if (row.status !== 'submitted') throw conflict(`Proposal is ${row.status}; expected submitted`, 'invalid_state');
      if (row.authorId === actor.id) throw forbidden('You cannot approve your own proposal', 'self_review');
      throw forbidden('You cannot approve this proposal');
    }
    const state = decryptProposalState(deps, row);
    const now = deps.clock.now();
    const { version } = await deps.db.transaction(async (tx) => {
      const r = await writePlan(deps, { clientId: row.clientId, state, actorId: actor.id, reason: `proposal:${row.id}` }, tx);
      await tx.update(proposals).set({ status: 'approved', reviewNote: note, reviewerId: actor.id, reviewedAt: now, updatedAt: now }).where(eq(proposals.id, row.id));
      return r;
    });
    await audit(deps, { actorId: actor.id, action: 'proposal.approved', targetType: 'proposal', targetId: row.id, ip: c.get('ip'), metadata: { clientId: row.clientId, planVersion: version } });
    await audit(deps, { actorId: actor.id, action: 'plan.write', targetType: 'plan', targetId: row.clientId, ip: c.get('ip'), metadata: { version, reason: `proposal:${row.id}` } });
    return c.json(await toProposal(deps, (await findProposal(deps.db, row.id))!));
  });

  app.delete('/:id', async (c) => {
    const actor = actorOf(c);
    const { row, perms } = await loadVisible(c, c.req.param('id'));
    if (!perms.delete) {
      if (row.status === 'submitted' || row.status === 'approved') throw conflict(`Proposal is ${row.status} and cannot be deleted`, 'invalid_state');
      throw forbidden('You cannot delete this proposal');
    }
    await deps.db.delete(proposals).where(eq(proposals.id, row.id));
    await audit(deps, { actorId: actor.id, action: 'proposal.deleted', targetType: 'proposal', targetId: row.id, ip: c.get('ip'), metadata: { clientId: row.clientId, status: row.status } });
    return c.json({ ok: true });
  });

  return app;
}
