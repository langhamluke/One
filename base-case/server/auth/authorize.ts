/**
 * AUTHORIZATION CHOKEPOINT. Every access decision about client data goes through these pure functions.
 *
 * Rules:
 *  - clients may only read/write their own plan, proposals and chat threads;
 *  - advisors may access the clients assigned to them (advisor_clients);
 *  - admins may access everything;
 *  - direct plan edits (PUT /api/plans/:clientId) are for the advisor-of-client or an admin, never the client;
 *  - proposals: author or staff-with-access may edit/submit/withdraw/delete; approve/reject only advisor-of-client
 *    or admin, and never the author of the proposal (four-eyes).
 *
 * Denied *visibility* is reported as 404 by the routes (anti-enumeration); denied *actions* on a visible
 * resource are 403. See server/errors.ts.
 */
import type { Role } from '../../shared/lib/types';
import type { ProposalStatus } from '../../shared/api';

export interface Actor {
  id: string;
  role: Role;
}

/** The subset of a proposal needed for decisions. */
export interface ProposalFacts {
  clientId: string;
  authorId: string;
  status: ProposalStatus;
}

export interface ProposalPermissions {
  view: boolean;
  edit: boolean;
  submit: boolean;
  withdraw: boolean;
  approve: boolean;
  reject: boolean;
  delete: boolean;
}

export function isStaff(actor: Actor): boolean {
  return actor.role === 'admin' || actor.role === 'advisor';
}

/** Is the actor the client themself, an advisor assigned to the client, or an admin? */
export function canAccessClient(actor: Actor, clientId: string, advisorIdsOfClient: readonly string[]): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role === 'client') return actor.id === clientId;
  if (actor.role === 'advisor') return advisorIdsOfClient.includes(actor.id);
  return false;
}

/** Staff with access: advisor assigned to the client, or admin. */
export function isStaffForClient(actor: Actor, clientId: string, advisorIdsOfClient: readonly string[]): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role === 'advisor') return advisorIdsOfClient.includes(actor.id);
  return false;
}

export function canEditPlanDirectly(actor: Actor, clientId: string, advisorIdsOfClient: readonly string[]): boolean {
  return isStaffForClient(actor, clientId, advisorIdsOfClient);
}

export function canCreateProposalFor(actor: Actor, clientId: string, advisorIdsOfClient: readonly string[]): boolean {
  return canAccessClient(actor, clientId, advisorIdsOfClient);
}

export function canViewPlanVersions(actor: Actor, clientId: string, advisorIdsOfClient: readonly string[]): boolean {
  return canAccessClient(actor, clientId, advisorIdsOfClient);
}

export function proposalPermissions(actor: Actor, p: ProposalFacts, advisorIdsOfClient: readonly string[]): ProposalPermissions {
  const view = canAccessClient(actor, p.clientId, advisorIdsOfClient);
  if (!view) return { view, edit: false, submit: false, withdraw: false, approve: false, reject: false, delete: false };
  const staff = isStaffForClient(actor, p.clientId, advisorIdsOfClient);
  const author = actor.id === p.authorId;
  const owner = author || staff;
  const editable = p.status === 'draft' || p.status === 'rejected';
  const reviewable = p.status === 'submitted' && staff && !author;
  return {
    view,
    edit: owner && editable,
    submit: owner && p.status === 'draft',
    withdraw: owner && p.status === 'submitted',
    approve: reviewable,
    reject: reviewable,
    delete: owner && (p.status === 'draft' || p.status === 'withdrawn' || p.status === 'rejected'),
  };
}

/** Chat threads belong to a client; anyone with client access may read/post. Deleting: thread creator or staff-with-access. */
export function canDeleteThread(actor: Actor, thread: { clientId: string; createdBy: string }, advisorIdsOfClient: readonly string[]): boolean {
  if (!canAccessClient(actor, thread.clientId, advisorIdsOfClient)) return false;
  return actor.id === thread.createdBy || actor.id === thread.clientId || isStaffForClient(actor, thread.clientId, advisorIdsOfClient);
}

/** Admin self-protection: an admin may not change their own role or status, and the last admin cannot be demoted/disabled. */
export function canChangeUser(
  actor: Actor,
  target: { id: string; role: Role; status: 'invited' | 'active' | 'disabled' },
  change: { role?: Role; status?: 'active' | 'disabled' },
  activeAdminCount: number,
): { ok: true } | { ok: false; reason: string } {
  if (actor.role !== 'admin') return { ok: false, reason: 'Admin role required' };
  const demotes = change.role !== undefined && change.role !== 'admin' && target.role === 'admin';
  const disables = change.status === 'disabled' && target.status !== 'disabled';
  if (actor.id === target.id && (demotes || disables)) return { ok: false, reason: 'You cannot demote or disable your own account' };
  if (target.role === 'admin' && target.status === 'active' && (demotes || disables) && activeAdminCount <= 1) {
    return { ok: false, reason: 'Cannot remove the last active admin' };
  }
  return { ok: true };
}
