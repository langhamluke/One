/**
 * /api/chat/*
 */
import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ChatMessage, ChatSendResponse, ChatThread, ChatThreadSummary, ProposalStatus } from '../../shared/api';
import type { AppDeps, AppEnv } from '../types';
import { chatMessages, chatThreads, type ChatThreadRow } from '../db/schema';
import { HttpError, forbidden, notFound } from '../errors';
import { actorOf, requireAuth, type AppContext } from '../auth/middleware';
import { canDeleteThread, proposalPermissions } from '../auth/authorize';
import { audit } from '../services/audit';
import { advisorIdsOf, requireClientAccess, visibleClientIds } from '../services/users';
import { loadPlan } from '../services/plans';
import { decryptProposalState, findProposal } from '../services/proposals';
import { buildPlanContext } from '../services/planContext';
import { answer, MAX_HISTORY, type AssistantTurn } from '../services/assistant';
import { getSettings } from '../services/settings';
import { aad } from '../crypto';
import { parseBody } from './util';

const MSG_AAD = (id: string) => aad('chat_messages', 'content_enc', id);
const MAX_CONTENT = 4000;

export function chatRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  const summaries = async (rows: ChatThreadRow[]): Promise<ChatThreadSummary[]> => {
    if (rows.length === 0) return [];
    const counts = await deps.db
      .select({ threadId: chatMessages.threadId, n: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(inArray(chatMessages.threadId, rows.map((r) => r.id)))
      .groupBy(chatMessages.threadId);
    const byId = new Map(counts.map((c) => [c.threadId, Number(c.n)]));
    return rows.map((t) => ({ id: t.id, clientId: t.clientId, title: t.title, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), messageCount: byId.get(t.id) ?? 0 }));
  };

  const decryptMessages = async (threadId: string): Promise<ChatMessage[]> => {
    const rows = await deps.db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
    return rows.map((m) => {
      let content = '';
      try {
        content = deps.crypto.decrypt(m.contentEnc, MSG_AAD(m.id)).toString('utf8');
      } catch {
        content = '[message unavailable]';
      }
      return { id: m.id, role: m.role, content, createdAt: m.createdAt.toISOString(), mode: m.mode };
    });
  };

  const loadVisibleThread = async (c: AppContext, id: string): Promise<{ thread: ChatThreadRow; advisorIds: string[] }> => {
    const actor = actorOf(c);
    if (!z.string().uuid().safeParse(id).success) throw notFound('Thread not found');
    const [thread] = await deps.db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
    if (!thread) throw notFound('Thread not found');
    const { advisorIds } = await requireClientAccess(deps.db, actor, thread.clientId).catch(() => {
      throw notFound('Thread not found');
    });
    return { thread, advisorIds };
  };

  app.get('/threads', async (c) => {
    const actor = actorOf(c);
    const clientId = c.req.query('clientId');
    let ids: string[] | 'all';
    if (clientId) {
      const { client } = await requireClientAccess(deps.db, actor, clientId);
      ids = [client.id];
    } else ids = await visibleClientIds(deps.db, actor);
    const where = ids === 'all' ? sql`true` : ids.length ? inArray(chatThreads.clientId, ids) : sql`false`;
    const rows = await deps.db.select().from(chatThreads).where(where).orderBy(desc(chatThreads.updatedAt));
    return c.json(await summaries(rows));
  });

  app.post('/threads', async (c) => {
    const actor = actorOf(c);
    const body = await parseBody(c, z.object({ clientId: z.string().uuid().optional(), title: z.string().trim().max(200).optional().default('') }));
    const clientId = body.clientId ?? (actor.role === 'client' ? actor.id : undefined);
    if (!clientId) throw new HttpError(400, 'clientId is required for staff-created threads', 'client_required');
    const { client } = await requireClientAccess(deps.db, actor, clientId);
    const now = deps.clock.now();
    const id = randomUUID();
    await deps.db.insert(chatThreads).values({ id, clientId: client.id, createdBy: actor.id, title: body.title || 'New conversation', createdAt: now, updatedAt: now });
    await audit(deps, { actorId: actor.id, action: 'chat.thread_created', targetType: 'chat_thread', targetId: id, ip: c.get('ip'), metadata: { clientId: client.id } });
    const [thread] = await deps.db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
    const [summary] = await summaries([thread]);
    const res: ChatThread = { ...summary, messages: [] };
    return c.json(res, 201);
  });

  app.get('/threads/:id', async (c) => {
    const { thread } = await loadVisibleThread(c, c.req.param('id'));
    const [summary] = await summaries([thread]);
    const res: ChatThread = { ...summary, messages: await decryptMessages(thread.id) };
    return c.json(res);
  });

  app.post('/threads/:id/messages', async (c) => {
    const actor = actorOf(c);
    const { thread, advisorIds } = await loadVisibleThread(c, c.req.param('id'));
    const body = await parseBody(c, z.object({ content: z.string().trim().min(1).max(MAX_CONTENT), proposalId: z.string().uuid().optional() }));
    const settings = await getSettings(deps);
    if (!settings.assistantEnabled) throw forbidden('The assistant is disabled by your firm', 'assistant_disabled');
    const limit = deps.rateLimiters.chat.hit(`chat:${actor.id}`, deps.clock.now().getTime());
    if (!limit.allowed) throw new HttpError(429, 'Too many messages. Slow down a little.', 'rate_limited', { 'Retry-After': String(limit.retryAfterSec) });

    // Context: the thread's client plan (approved), or a proposal draft for that same client when requested.
    const { client } = await requireClientAccess(deps.db, actor, thread.clientId);
    let state = (await loadPlan(deps, client)).state;
    if (body.proposalId) {
      const p = await findProposal(deps.db, body.proposalId);
      if (!p || p.clientId !== thread.clientId) throw notFound('Proposal not found');
      const perms = proposalPermissions(actor, { clientId: p.clientId, authorId: p.authorId, status: p.status as ProposalStatus }, advisorIds);
      if (!perms.view) throw notFound('Proposal not found');
      state = decryptProposalState(deps, p);
    }
    const ctx = buildPlanContext(state);
    const history: AssistantTurn[] = (await decryptMessages(thread.id)).slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));
    const client_ = deps.config.anthropicApiKey ? deps.anthropic() : null;
    const reply = await answer({ client: client_, model: deps.config.chatModel, logger: deps.logger, firmName: settings.firmName }, ctx, history, body.content);

    const now = deps.clock.now();
    const userId = randomUUID();
    const replyId = randomUUID();
    const replyAt = new Date(now.getTime() + 1);
    await deps.db.insert(chatMessages).values([
      { id: userId, threadId: thread.id, role: 'user', contentEnc: deps.crypto.encrypt(body.content, MSG_AAD(userId)), mode: reply.mode, createdAt: now },
      { id: replyId, threadId: thread.id, role: 'assistant', contentEnc: deps.crypto.encrypt(reply.content, MSG_AAD(replyId)), mode: reply.mode, createdAt: replyAt },
    ]);
    const title = thread.title === 'New conversation' || thread.title === '' ? body.content.slice(0, 60) : thread.title;
    await deps.db.update(chatThreads).set({ updatedAt: replyAt, title }).where(eq(chatThreads.id, thread.id));
    await audit(deps, { actorId: actor.id, action: 'chat.message', targetType: 'chat_thread', targetId: thread.id, ip: c.get('ip'), metadata: { clientId: thread.clientId, mode: reply.mode, proposalContext: Boolean(body.proposalId), derived: Boolean(ctx.derived) } });
    const res: ChatSendResponse = {
      message: { id: userId, role: 'user', content: body.content, createdAt: now.toISOString(), mode: reply.mode },
      reply: { id: replyId, role: 'assistant', content: reply.content, createdAt: replyAt.toISOString(), mode: reply.mode },
    };
    return c.json(res, 201);
  });

  app.delete('/threads/:id', async (c) => {
    const actor = actorOf(c);
    const { thread, advisorIds } = await loadVisibleThread(c, c.req.param('id'));
    if (!canDeleteThread(actor, thread, advisorIds)) throw forbidden('You cannot delete this thread');
    await deps.db.delete(chatThreads).where(and(eq(chatThreads.id, thread.id)));
    await audit(deps, { actorId: actor.id, action: 'chat.thread_deleted', targetType: 'chat_thread', targetId: thread.id, ip: c.get('ip'), metadata: { clientId: thread.clientId } });
    return c.json({ ok: true });
  });

  return app;
}
