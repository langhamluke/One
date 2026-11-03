/**
 * Proposals: a client's (or advisor's) proposed PlanState awaiting review. Approval copies the state into `plans`.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Proposal, ProposalStatus, ProposalSummary } from '../../shared/api';
import { mergePlanState, type PlanState } from '../../shared/lib/inputs';
import type { AppDeps } from '../types';
import type { Db } from '../db/index';
import { proposals, type ProposalRow } from '../db/schema';
import { aad } from '../crypto';
import { usersByIds } from './users';

export const PROPOSAL_AAD = (id: string) => aad('proposals', 'state_enc', id);

export async function proposalSummaries(db: Db, rows: ProposalRow[]): Promise<ProposalSummary[]> {
  const ids = rows.flatMap((r) => [r.clientId, r.authorId, r.reviewerId ?? '']).filter(Boolean);
  const byId = await usersByIds(db, ids);
  const name = (id: string | null) => (id ? (byId.get(id)?.displayName ?? '') : null);
  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: name(r.clientId) ?? '',
    authorId: r.authorId,
    authorName: name(r.authorId) ?? '',
    title: r.title,
    note: r.note,
    status: r.status as ProposalStatus,
    reviewNote: r.reviewNote,
    reviewerId: r.reviewerId,
    reviewerName: name(r.reviewerId),
    baseVersion: r.baseVersion,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  }));
}

export function decryptProposalState(deps: Pick<AppDeps, 'crypto'>, row: ProposalRow): PlanState {
  return mergePlanState(deps.crypto.decryptJson(row.stateEnc, PROPOSAL_AAD(row.id)));
}

export async function toProposal(deps: Pick<AppDeps, 'db' | 'crypto'>, row: ProposalRow): Promise<Proposal> {
  const [summary] = await proposalSummaries(deps.db, [row]);
  return { ...summary, state: decryptProposalState(deps, row) };
}

export async function findProposal(db: Db, id: string): Promise<ProposalRow | undefined> {
  const [row] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  return row;
}

export async function listProposals(db: Db, filter: { clientIds: string[] | 'all'; status?: ProposalStatus }): Promise<ProposalRow[]> {
  const conds = [];
  if (filter.clientIds !== 'all') {
    if (filter.clientIds.length === 0) return [];
    conds.push(inArray(proposals.clientId, filter.clientIds));
  }
  if (filter.status) conds.push(eq(proposals.status, filter.status));
  return db
    .select()
    .from(proposals)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(proposals.updatedAt));
}

export async function pendingCounts(db: Db, clientIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  const rows = await db
    .select({ clientId: proposals.clientId, n: sql<number>`count(*)::int` })
    .from(proposals)
    .where(and(inArray(proposals.clientId, clientIds), eq(proposals.status, 'submitted')))
    .groupBy(proposals.clientId);
  for (const r of rows) out.set(r.clientId, Number(r.n));
  return out;
}
