/**
 * User lookups, UserSummary mapping and client-access resolution (the DB side of the authorization chokepoint).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserSummary } from '../../shared/api';
import type { Role } from '../../shared/lib/types';
import type { Db } from '../db/index';
import { advisorClients, users, type UserRow } from '../db/schema';
import { canAccessClient, type Actor } from '../auth/authorize';
import { notFound } from '../errors';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  const e = normalizeEmail(email);
  const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${e}`).limit(1);
  return row;
}

export async function findUserById(db: Db, id: string): Promise<UserRow | undefined> {
  if (!isUuid(id)) return undefined;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Advisor ids assigned to a client. */
export async function advisorIdsOf(db: Db, clientId: string): Promise<string[]> {
  if (!isUuid(clientId)) return [];
  const rows = await db.select({ advisorId: advisorClients.advisorId }).from(advisorClients).where(eq(advisorClients.clientId, clientId));
  return rows.map((r) => r.advisorId);
}

/** Client ids assigned to an advisor. */
export async function clientIdsOf(db: Db, advisorId: string): Promise<string[]> {
  const rows = await db.select({ clientId: advisorClients.clientId }).from(advisorClients).where(eq(advisorClients.advisorId, advisorId));
  return rows.map((r) => r.clientId);
}

/** Assignment map for many users at once: userId -> ids of the other side. */
export async function assignmentsFor(db: Db, userIds: string[]): Promise<{ advisorsOf: Map<string, string[]>; clientsOf: Map<string, string[]> }> {
  const advisorsOf = new Map<string, string[]>();
  const clientsOf = new Map<string, string[]>();
  if (userIds.length === 0) return { advisorsOf, clientsOf };
  const rows = await db
    .select()
    .from(advisorClients)
    .where(sql`${advisorClients.advisorId} IN ${userIds} OR ${advisorClients.clientId} IN ${userIds}`);
  for (const r of rows) {
    advisorsOf.set(r.clientId, [...(advisorsOf.get(r.clientId) ?? []), r.advisorId]);
    clientsOf.set(r.advisorId, [...(clientsOf.get(r.advisorId) ?? []), r.clientId]);
  }
  return { advisorsOf, clientsOf };
}

export function toUserSummary(u: UserRow, rel?: { advisorIds?: string[]; clientIds?: string[] }): UserSummary {
  const out: UserSummary = {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role as Role,
    status: u.status,
    mfaEnabled: u.totpEnabled,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  };
  if (u.role === 'client') out.advisorIds = rel?.advisorIds ?? [];
  if (u.role === 'advisor') out.clientIds = rel?.clientIds ?? [];
  return out;
}

export async function userSummary(db: Db, u: UserRow): Promise<UserSummary> {
  const { advisorsOf, clientsOf } = await assignmentsFor(db, [u.id]);
  return toUserSummary(u, { advisorIds: advisorsOf.get(u.id), clientIds: clientsOf.get(u.id) });
}

export interface ClientAccess {
  client: UserRow;
  advisorIds: string[];
}

/**
 * Resolve a client and verify the actor may access it. Throws 404 when the client does not exist, is not a client,
 * or the actor has no access (anti-enumeration: 404 rather than 403).
 */
export async function requireClientAccess(db: Db, actor: Actor, clientId: string): Promise<ClientAccess> {
  const client = await findUserById(db, clientId);
  if (!client || client.role !== 'client') throw notFound('Client not found');
  const advisorIds = await advisorIdsOf(db, clientId);
  if (!canAccessClient(actor, clientId, advisorIds)) throw notFound('Client not found');
  return { client, advisorIds };
}

/** Clients visible to the actor: all for admin, assigned for advisor, self for client. */
export async function visibleClientIds(db: Db, actor: Actor): Promise<string[] | 'all'> {
  if (actor.role === 'admin') return 'all';
  if (actor.role === 'advisor') return clientIdsOf(db, actor.id);
  return [actor.id];
}

export async function usersByIds(db: Db, ids: string[]): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids.filter(isUuid))];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function countActiveAdmins(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
  return Number(row?.n ?? 0);
}
