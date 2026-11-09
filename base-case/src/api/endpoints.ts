/** Typed endpoint functions following shared/api.ts ROUTES. Request bodies not spelled out in the contract are documented here. */
import { api, unwrapList } from './client';
import type {
  AcceptInviteRequest, AuditEntry, ChangePasswordRequest, ChatSendRequest, ChatSendResponse, ChatThread, ChatThreadSummary,
  ClientDetail, ClientListItem, DataStatus, InviteRequest, InviteResponse, LoginRequest, LoginResponse, MeResponse,
  MfaSetupResponse, PlanRecord, PlanVersionSummary, ProductInfo, Proposal, ProposalStatus, ProposalSummary, SessionInfo, SettingsRecord, UserSummary,
} from '@shared/api';
import type { PlanState } from '@shared/lib/inputs';
import type { Role } from '@shared/lib/types';

const q = (params: Record<string, string | number | undefined | null>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const auth = {
  login: (body: LoginRequest) => api<LoginResponse>('POST', '/api/auth/login', body, { noRedirect: true }),
  mfaVerify: (code: string) => api<{ ok: true }>('POST', '/api/auth/mfa/verify', { code }),
  logout: () => api<{ ok: true }>('POST', '/api/auth/logout', {}, { noRedirect: true }),
  me: (opts: { noRedirect?: boolean } = {}) => api<MeResponse>('GET', '/api/me', undefined, opts),
  product: () => api<ProductInfo>('GET', '/api/product', undefined, { noRedirect: true }),
  inviteInfo: (token: string) => api<{ email: string; displayName?: string; role: Role; expiresAt?: string }>('GET', `/api/auth/invite/${encodeURIComponent(token)}`, undefined, { noRedirect: true }),
  acceptInvite: (body: AcceptInviteRequest) => api<{ ok: true }>('POST', '/api/auth/accept-invite', body, { noRedirect: true }),
  changePassword: (body: ChangePasswordRequest) => api<{ ok: true }>('POST', '/api/auth/change-password', body),
  mfaSetup: () => api<MfaSetupResponse>('POST', '/api/auth/mfa/setup', {}),
  mfaEnable: (code: string) => api<{ ok: true }>('POST', '/api/auth/mfa/enable', { code }),
  mfaDisable: (code: string) => api<{ ok: true }>('POST', '/api/auth/mfa/disable', { code }),
  sessions: async () => unwrapList<SessionInfo>(await api<unknown>('GET', '/api/auth/sessions'), 'sessions'),
  revokeSession: (id: string) => api<{ ok: true }>('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`),
};

export const admin = {
  users: async () => unwrapList<UserSummary>(await api<unknown>('GET', '/api/admin/users'), 'users'),
  invite: (body: InviteRequest) => api<InviteResponse>('POST', '/api/admin/invites', body),
  /** Body: any of { role, status, displayName } */
  updateUser: (id: string, body: Partial<Pick<UserSummary, 'role' | 'status' | 'displayName'>>) => api<UserSummary>('PATCH', `/api/admin/users/${encodeURIComponent(id)}`, body),
  resetPassword: (id: string) => api<{ inviteUrl?: string; ok?: boolean }>('POST', `/api/admin/users/${encodeURIComponent(id)}/reset-password`, {}),
  /** Body: { clientId, advisorId } */
  assign: (clientId: string, advisorId: string) => api<{ ok: true }>('POST', '/api/admin/assignments', { clientId, advisorId }),
  unassign: (clientId: string, advisorId: string) => api<{ ok: true }>('DELETE', '/api/admin/assignments', { clientId, advisorId }),
  audit: async (limit = 50, before?: string) => {
    const data = await api<unknown>('GET', `/api/admin/audit${q({ limit, before })}`);
    const entries = unwrapList<AuditEntry>(data, 'entries');
    const next = data && typeof data === 'object' ? ((data as Record<string, unknown>).nextBefore as string | null | undefined) : undefined;
    return { entries, nextBefore: next ?? (entries.length === limit ? entries[entries.length - 1]?.id ?? null : null) };
  },
  settings: () => api<SettingsRecord>('GET', '/api/admin/settings'),
  updateSettings: (body: Partial<SettingsRecord>) => api<SettingsRecord>('PATCH', '/api/admin/settings', body),
};

export const clients = {
  list: async () => unwrapList<ClientListItem>(await api<unknown>('GET', '/api/clients'), 'clients'),
  get: (id: string) => api<ClientDetail>('GET', `/api/clients/${encodeURIComponent(id)}`),
};

export const plans = {
  me: () => api<PlanRecord>('GET', '/api/plans/me'),
  get: (clientId: string) => api<PlanRecord>('GET', `/api/plans/${encodeURIComponent(clientId)}`),
  /** Body: { state, reason? } */
  put: (clientId: string, state: PlanState, reason?: string) => api<PlanRecord>('PUT', `/api/plans/${encodeURIComponent(clientId)}`, { state, reason }),
  versions: async (clientId: string) => unwrapList<PlanVersionSummary>(await api<unknown>('GET', `/api/plans/${encodeURIComponent(clientId)}/versions`), 'versions'),
  version: (clientId: string, version: number) => api<PlanRecord>('GET', `/api/plans/${encodeURIComponent(clientId)}/versions/${version}`),
};

export const proposals = {
  list: async (params: { clientId?: string; status?: ProposalStatus | string } = {}) => unwrapList<ProposalSummary>(await api<unknown>('GET', `/api/proposals${q(params)}`), 'proposals'),
  /** Body: { clientId?, title, note, state? } */
  create: (body: { clientId?: string; title: string; note?: string; state?: PlanState }) => api<Proposal>('POST', '/api/proposals', body),
  get: (id: string) => api<Proposal>('GET', `/api/proposals/${encodeURIComponent(id)}`),
  /** Body: { state, title?, note? } */
  update: (id: string, body: { state?: PlanState; title?: string; note?: string }) => api<Proposal>('PUT', `/api/proposals/${encodeURIComponent(id)}`, body),
  submit: (id: string, body: { title?: string; note?: string }) => api<Proposal>('POST', `/api/proposals/${encodeURIComponent(id)}/submit`, body),
  withdraw: (id: string) => api<Proposal>('POST', `/api/proposals/${encodeURIComponent(id)}/withdraw`, {}),
  approve: (id: string, note: string) => api<Proposal>('POST', `/api/proposals/${encodeURIComponent(id)}/approve`, { note }),
  reject: (id: string, note: string) => api<Proposal>('POST', `/api/proposals/${encodeURIComponent(id)}/reject`, { note }),
  remove: (id: string) => api<{ ok: true }>('DELETE', `/api/proposals/${encodeURIComponent(id)}`),
};

export const chat = {
  threads: async (clientId?: string) => unwrapList<ChatThreadSummary>(await api<unknown>('GET', `/api/chat/threads${q({ clientId })}`), 'threads'),
  /** Body: { clientId?, title? } */
  create: (body: { clientId?: string; title?: string }) => api<ChatThread>('POST', '/api/chat/threads', body),
  get: (id: string) => api<ChatThread>('GET', `/api/chat/threads/${encodeURIComponent(id)}`),
  send: (id: string, body: ChatSendRequest) => api<ChatSendResponse>('POST', `/api/chat/threads/${encodeURIComponent(id)}/messages`, body),
  remove: (id: string) => api<{ ok: true }>('DELETE', `/api/chat/threads/${encodeURIComponent(id)}`),
};

export const data = {
  status: () => api<DataStatus>('GET', '/api/data/status'),
};
