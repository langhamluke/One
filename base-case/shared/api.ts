/**
 * API contract shared by server and client. All endpoints are JSON over same-origin fetch with a
 * session cookie. Errors: { error: string, code?: string } with 4xx/5xx status.
 */
import type { PlanState } from './lib/inputs';
import type { Role } from './lib/types';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: 'invited' | 'active' | 'disabled';
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** For clients: assigned advisor ids */
  advisorIds?: string[];
  /** For advisors: assigned client ids */
  clientIds?: string[];
}

export interface MeResponse {
  user: UserSummary;
  firm: { name: string; assistantMode: 'claude' | 'offline'; dataAsOf: string };
  /** True when the session still needs a TOTP code */
  mfaPending?: boolean;
}

export interface LoginRequest { email: string; password: string }
export interface LoginResponse { ok: true; mfaRequired: boolean; user?: UserSummary }
export interface MfaVerifyRequest { code: string }
export interface AcceptInviteRequest { token: string; password: string; displayName: string }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface MfaSetupResponse { otpauthUrl: string; qrDataUrl: string }
export interface SessionInfo { id: string; createdAt: string; lastSeenAt: string; userAgent: string; current: boolean }

export type ProposalStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'withdrawn';

export interface ProposalSummary {
  id: string;
  clientId: string;
  clientName: string;
  authorId: string;
  authorName: string;
  title: string;
  note: string;
  status: ProposalStatus;
  reviewNote: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  baseVersion: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface Proposal extends ProposalSummary {
  state: PlanState;
}

export interface PlanRecord {
  clientId: string;
  version: number;
  state: PlanState;
  updatedAt: string;
  updatedById: string | null;
  updatedByName: string | null;
}

export interface PlanVersionSummary {
  version: number;
  createdAt: string;
  createdByName: string | null;
  reason: string;
}

export interface ClientListItem {
  id: string;
  displayName: string;
  email: string;
  status: UserSummary['status'];
  planVersion: number;
  planUpdatedAt: string | null;
  pendingProposals: number;
  advisorNames: string[];
  lastLoginAt: string | null;
}

export interface ClientDetail {
  client: UserSummary;
  plan: PlanRecord | null;
  proposals: ProposalSummary[];
}

export interface InviteRequest {
  email: string;
  role: Role;
  displayName: string;
  /** For client invites: advisor to assign */
  advisorId?: string;
}
export interface InviteResponse { inviteUrl: string; expiresAt: string; userId: string }

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
}

export interface ChatThreadSummary {
  id: string;
  clientId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  mode: 'claude' | 'offline';
}
export interface ChatThread extends ChatThreadSummary {
  messages: ChatMessage[];
}
export interface ChatSendRequest { content: string; /** Use the draft proposal state as context instead of approved plan */ proposalId?: string }
export interface ChatSendResponse { message: ChatMessage; reply: ChatMessage }

export interface DataStatus {
  asOf: { irs: string; tax: string; wages: string; loans: string; ssa: string };
  unverifiedCount: number;
  totalCount: number;
  staleCount: number;
  /** Primary data points (excludes values derived from other sourced values) */
  primaryCount?: number;
  primaryUnverifiedCount?: number;
  derivedCount?: number;
}

export interface SettingsRecord {
  firmName: string;
  disclaimer: string;
  assistantEnabled: boolean;
  inviteExpiryHours: number;
  sessionHours: number;
  requireMfaForStaff: boolean;
}

export interface ApiError { error: string; code?: string }

/** Route table (documentation; the server implements these exactly). */
export const ROUTES = {
  health: 'GET /api/health',
  login: 'POST /api/auth/login',
  mfaVerify: 'POST /api/auth/mfa/verify',
  logout: 'POST /api/auth/logout',
  me: 'GET /api/me',
  acceptInvite: 'POST /api/auth/accept-invite',
  inviteInfo: 'GET /api/auth/invite/:token',
  changePassword: 'POST /api/auth/change-password',
  mfaSetup: 'POST /api/auth/mfa/setup',
  mfaEnable: 'POST /api/auth/mfa/enable',
  mfaDisable: 'POST /api/auth/mfa/disable',
  sessions: 'GET /api/auth/sessions',
  revokeSession: 'DELETE /api/auth/sessions/:id',
  // admin
  users: 'GET /api/admin/users',
  invite: 'POST /api/admin/invites',
  updateUser: 'PATCH /api/admin/users/:id',
  resetPassword: 'POST /api/admin/users/:id/reset-password',
  assign: 'POST /api/admin/assignments',
  unassign: 'DELETE /api/admin/assignments',
  audit: 'GET /api/admin/audit?limit=&before=',
  settings: 'GET /api/admin/settings',
  updateSettings: 'PATCH /api/admin/settings',
  // clients (advisor/admin)
  clients: 'GET /api/clients',
  client: 'GET /api/clients/:id',
  // plans
  myPlan: 'GET /api/plans/me',
  plan: 'GET /api/plans/:clientId',
  putPlan: 'PUT /api/plans/:clientId',
  planVersions: 'GET /api/plans/:clientId/versions',
  planVersion: 'GET /api/plans/:clientId/versions/:version',
  // proposals
  proposals: 'GET /api/proposals?clientId=&status=',
  createProposal: 'POST /api/proposals',
  proposal: 'GET /api/proposals/:id',
  updateProposal: 'PUT /api/proposals/:id',
  submitProposal: 'POST /api/proposals/:id/submit',
  withdrawProposal: 'POST /api/proposals/:id/withdraw',
  approveProposal: 'POST /api/proposals/:id/approve',
  rejectProposal: 'POST /api/proposals/:id/reject',
  deleteProposal: 'DELETE /api/proposals/:id',
  // chat
  threads: 'GET /api/chat/threads?clientId=',
  createThread: 'POST /api/chat/threads',
  thread: 'GET /api/chat/threads/:id',
  send: 'POST /api/chat/threads/:id/messages',
  deleteThread: 'DELETE /api/chat/threads/:id',
  // data
  dataStatus: 'GET /api/data/status',
} as const;
