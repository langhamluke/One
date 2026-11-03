/**
 * /api/admin/* (admin role only)
 */
import { Hono } from 'hono';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { InviteResponse, UserSummary } from '../../shared/api';
import type { AppDeps, AppEnv } from '../types';
import { advisorClients, invites, sessions, users } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { actorOf, requireAuth, requireRole, type AppContext } from '../auth/middleware';
import { canChangeUser } from '../auth/authorize';
import { audit, listAudit } from '../services/audit';
import { getSetting, getSettings, settingsPatchSchema, updateSettings } from '../services/settings';
import { assignmentsFor, countActiveAdmins, findUserByEmail, findUserById, isValidEmail, normalizeEmail, toUserSummary, userSummary } from '../services/users';
import { newInviteToken } from './auth';
import { parseBody } from './util';

const roleSchema = z.enum(['admin', 'advisor', 'client']);

export function adminRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth, requireRole('admin'));

  app.get('/users', async (c) => {
    const rows = await deps.db.select().from(users).orderBy(desc(users.createdAt));
    const { advisorsOf, clientsOf } = await assignmentsFor(deps.db, rows.map((r) => r.id));
    const out: UserSummary[] = rows.map((u) => toUserSummary(u, { advisorIds: advisorsOf.get(u.id), clientIds: clientsOf.get(u.id) }));
    return c.json(out);
  });

  const issueInvite = async (userId: string, invitedBy: string): Promise<{ inviteUrl: string; expiresAt: Date }> => {
    const now = deps.clock.now();
    const hours = await getSetting(deps, 'inviteExpiryHours');
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);
    const { token, hash } = newInviteToken();
    // Void earlier outstanding tokens for the user.
    await deps.db.update(invites).set({ acceptedAt: now }).where(and(eq(invites.userId, userId), isNull(invites.acceptedAt)));
    await deps.db.insert(invites).values({ id: randomUUID(), tokenHash: hash, userId, invitedBy, expiresAt, acceptedAt: null, createdAt: now });
    return { inviteUrl: `${deps.config.appOrigin}/invite/${token}`, expiresAt };
  };

  app.post('/invites', async (c) => {
    const actor = actorOf(c);
    const body = await parseBody(
      c,
      z.object({ email: z.string().max(254), role: roleSchema, displayName: z.string().trim().min(1).max(120), advisorId: z.string().uuid().optional() }),
    );
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) throw badRequest('Invalid email address', 'invalid_email');
    if (await findUserByEmail(deps.db, email)) throw conflict('A user with that email already exists', 'email_exists');
    let advisor = null;
    if (body.advisorId) {
      if (body.role !== 'client') throw badRequest('advisorId applies to client invites only');
      advisor = await findUserById(deps.db, body.advisorId);
      if (!advisor || advisor.role !== 'advisor') throw badRequest('advisorId must reference an advisor', 'invalid_advisor');
    }
    const now = deps.clock.now();
    const userId = randomUUID();
    await deps.db.insert(users).values({ id: userId, email, passwordHash: null, role: body.role, displayName: body.displayName, status: 'invited', createdAt: now });
    if (advisor) await deps.db.insert(advisorClients).values({ advisorId: advisor.id, clientId: userId, createdAt: now }).onConflictDoNothing();
    const { inviteUrl, expiresAt } = await issueInvite(userId, actor.id);
    await deps.mailer.sendInvite({ to: email, displayName: body.displayName, inviteUrl, expiresAt, kind: 'invite' });
    await audit(deps, { actorId: actor.id, action: 'invite.created', targetType: 'user', targetId: userId, ip: c.get('ip'), metadata: { role: body.role, advisorId: advisor?.id ?? null } });
    if (advisor) await audit(deps, { actorId: actor.id, action: 'assignment.created', targetType: 'user', targetId: userId, ip: c.get('ip'), metadata: { advisorId: advisor.id } });
    const res: InviteResponse = { inviteUrl, expiresAt: expiresAt.toISOString(), userId };
    return c.json(res, 201);
  });

  app.patch('/users/:id', async (c) => {
    const actor = actorOf(c);
    const target = await findUserById(deps.db, c.req.param('id'));
    if (!target) throw notFound('User not found');
    const body = await parseBody(c, z.object({ role: roleSchema.optional(), status: z.enum(['active', 'disabled']).optional(), displayName: z.string().trim().min(1).max(120).optional() }).strict());
    const check = canChangeUser(actor, { id: target.id, role: target.role, status: target.status }, { role: body.role, status: body.status }, await countActiveAdmins(deps.db));
    if (!check.ok) throw forbidden(check.reason, 'admin_protection');
    if (body.status === 'active' && !target.passwordHash) throw badRequest('User has not accepted their invite yet; send a new invite instead', 'not_accepted');
    const patch: Partial<typeof users.$inferInsert> = {};
    if (body.displayName !== undefined) patch.displayName = body.displayName;
    if (body.role !== undefined && body.role !== target.role) patch.role = body.role;
    if (body.status !== undefined && body.status !== target.status) patch.status = body.status;
    if (Object.keys(patch).length > 0) await deps.db.update(users).set(patch).where(eq(users.id, target.id));
    if (patch.status === 'disabled') await deps.db.delete(sessions).where(eq(sessions.userId, target.id));
    if (patch.role) {
      // Assignments only make sense between advisors and clients; drop any that no longer fit.
      if (patch.role !== 'advisor') await deps.db.delete(advisorClients).where(eq(advisorClients.advisorId, target.id));
      if (patch.role !== 'client') await deps.db.delete(advisorClients).where(eq(advisorClients.clientId, target.id));
      await audit(deps, { actorId: actor.id, action: 'user.role_changed', targetType: 'user', targetId: target.id, ip: c.get('ip'), metadata: { from: target.role, to: patch.role } });
    }
    if (patch.status) await audit(deps, { actorId: actor.id, action: 'user.status_changed', targetType: 'user', targetId: target.id, ip: c.get('ip'), metadata: { from: target.status, to: patch.status } });
    if (patch.displayName !== undefined) await audit(deps, { actorId: actor.id, action: 'user.updated', targetType: 'user', targetId: target.id, ip: c.get('ip'), metadata: { fields: ['displayName'] } });
    const fresh = await findUserById(deps.db, target.id);
    return c.json(await userSummary(deps.db, fresh!));
  });

  app.post('/users/:id/reset-password', async (c) => {
    const actor = actorOf(c);
    const target = await findUserById(deps.db, c.req.param('id'));
    if (!target) throw notFound('User not found');
    if (target.status === 'disabled') throw badRequest('User is disabled', 'user_disabled');
    const { inviteUrl, expiresAt } = await issueInvite(target.id, actor.id);
    await deps.db.delete(sessions).where(eq(sessions.userId, target.id));
    await deps.mailer.sendInvite({ to: target.email, displayName: target.displayName, inviteUrl, expiresAt, kind: 'reset' });
    await audit(deps, { actorId: actor.id, action: 'password.reset_issued', targetType: 'user', targetId: target.id, ip: c.get('ip') });
    const res: InviteResponse = { inviteUrl, expiresAt: expiresAt.toISOString(), userId: target.id };
    return c.json(res);
  });

  const assignmentSchema = z.object({ advisorId: z.string().uuid(), clientId: z.string().uuid() });
  const assignmentFromRequest = async (c: AppContext) => {
    const q = c.req.query();
    const body = q.advisorId && q.clientId ? assignmentSchema.parse({ advisorId: q.advisorId, clientId: q.clientId }) : await parseBody(c, assignmentSchema);
    const advisor = await findUserById(deps.db, body.advisorId);
    const client = await findUserById(deps.db, body.clientId);
    if (!advisor || advisor.role !== 'advisor') throw badRequest('advisorId must reference an advisor', 'invalid_advisor');
    if (!client || client.role !== 'client') throw badRequest('clientId must reference a client', 'invalid_client');
    return { advisor, client };
  };

  app.post('/assignments', async (c) => {
    const actor = actorOf(c);
    const { advisor, client } = await assignmentFromRequest(c);
    await deps.db.insert(advisorClients).values({ advisorId: advisor.id, clientId: client.id, createdAt: deps.clock.now() }).onConflictDoNothing();
    await audit(deps, { actorId: actor.id, action: 'assignment.created', targetType: 'user', targetId: client.id, ip: c.get('ip'), metadata: { advisorId: advisor.id } });
    return c.json({ ok: true });
  });

  app.delete('/assignments', async (c) => {
    const actor = actorOf(c);
    const { advisor, client } = await assignmentFromRequest(c);
    await deps.db.delete(advisorClients).where(and(eq(advisorClients.advisorId, advisor.id), eq(advisorClients.clientId, client.id)));
    await audit(deps, { actorId: actor.id, action: 'assignment.removed', targetType: 'user', targetId: client.id, ip: c.get('ip'), metadata: { advisorId: advisor.id } });
    return c.json({ ok: true });
  });

  app.get('/audit', async (c) => {
    const limitRaw = Number(c.req.query('limit') ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;
    const beforeRaw = c.req.query('before');
    const before = beforeRaw && /^\d+$/.test(beforeRaw) ? Number(beforeRaw) : null;
    return c.json(await listAudit(deps.db, { limit, before }));
  });

  app.get('/settings', async (c) => c.json(await getSettings(deps)));

  app.patch('/settings', async (c) => {
    const actor = actorOf(c);
    const patch = await parseBody(c, settingsPatchSchema);
    const updated = await updateSettings(deps, patch);
    await audit(deps, { actorId: actor.id, action: 'settings.changed', targetType: 'settings', targetId: 'firm', ip: c.get('ip'), metadata: { keys: Object.keys(patch) } });
    return c.json(updated);
  });

  return app;
}
