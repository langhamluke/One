/**
 * Append-only audit log. Metadata must never contain plan contents or PII beyond ids and display names.
 */
import { desc, eq, lt, and, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuditEntry } from '../../shared/api';
import type { AppDeps } from '../types';
import { auditLog, users } from '../db/schema';
import { sha256Hex } from '../crypto';
import type { Db } from '../db/index';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

export type AuditAction =
  | 'login.success'
  | 'login.failure'
  | 'login.locked'
  | 'login.mfa_required'
  | 'mfa.verified'
  | 'mfa.failed'
  | 'mfa.enabled'
  | 'mfa.disabled'
  | 'logout'
  | 'invite.created'
  | 'invite.accepted'
  | 'password.changed'
  | 'password.reset_issued'
  | 'password.reset_completed'
  | 'user.role_changed'
  | 'user.status_changed'
  | 'user.updated'
  | 'assignment.created'
  | 'assignment.removed'
  | 'plan.read'
  | 'plan.write'
  | 'proposal.created'
  | 'proposal.updated'
  | 'proposal.submitted'
  | 'proposal.withdrawn'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'proposal.deleted'
  | 'chat.thread_created'
  | 'chat.message'
  | 'chat.thread_deleted'
  | 'settings.changed'
  | 'session.revoked';

const FORBIDDEN_META_KEYS = new Set(['state', 'plan', 'content', 'password', 'token', 'cookie', 'email']);

export function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!meta) return out;
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_META_KEYS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => (typeof x === 'string' ? x.slice(0, 120) : typeof x === 'number' ? x : String(x).slice(0, 120)));
  }
  return out;
}

/** Hash an email for failure records so raw addresses are never stored on failed attempts. */
export function emailHash(email: string): string {
  return sha256Hex(email.trim().toLowerCase()).slice(0, 16);
}

export async function audit(deps: Pick<AppDeps, 'db' | 'clock' | 'logger'>, input: AuditInput & { action: AuditAction }, db: Db = deps.db): Promise<void> {
  try {
    await db.insert(auditLog).values({
      at: deps.clock.now(),
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ip: input.ip ?? null,
      metadata: sanitizeMetadata(input.metadata),
    });
  } catch (err) {
    deps.logger.error('audit write failed', { action: input.action, err: (err as Error).constructor?.name });
  }
}

export async function listAudit(db: Db, opts: { limit: number; before?: number | null }): Promise<{ entries: AuditEntry[]; nextBefore: string | null }> {
  const actor = alias(users, 'actor');
  const where = opts.before ? lt(auditLog.id, opts.before) : undefined;
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      actorId: auditLog.actorId,
      actorName: actor.displayName,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      ip: auditLog.ip,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .where(where ? and(where) : sql`true`)
    .orderBy(desc(auditLog.id))
    .limit(opts.limit);
  const entries: AuditEntry[] = rows.map((r) => ({
    id: String(r.id),
    at: r.at.toISOString(),
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    ip: r.ip,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }));
  const nextBefore = rows.length === opts.limit && rows.length > 0 ? String(rows[rows.length - 1].id) : null;
  return { entries, nextBefore };
}
