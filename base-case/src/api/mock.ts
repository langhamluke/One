/**
 * DEV-ONLY in-memory mock of the API contract (activated by VITE_MOCK_API=1). Nothing here ships unless the env var
 * is set at build time. Keeps users, plans, proposals, chat threads, audit entries and settings in memory, seeded from
 * PERSONAS. The current user defaults to the admin; POST /api/auth/login with any seeded email switches user.
 */
import { ApiError, type Method } from './client';
import type {
  AuditEntry, ChatMessage, ChatThread, ClientDetail, ClientListItem, DataStatus, InviteResponse, MeResponse, PlanRecord,
  PlanVersionSummary, Proposal, SessionInfo, SettingsRecord, UserSummary,
} from '@shared/api';
import { defaultPlanState, mergePlanState, type PlanState } from '@shared/lib/inputs';
import { PERSONAS } from '@shared/data/personas';

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
let seq = 100;
const nid = (p: string) => `${p}_${(seq++).toString(36)}`;

function clone<T>(x: T): T {
  return structuredClone(x);
}

// ---------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------
const users: UserSummary[] = [
  { id: 'u_admin', email: 'admin@demo.basecase.local', displayName: 'Ada Admin', role: 'admin', status: 'active', mfaEnabled: true, createdAt: ago(900), lastLoginAt: ago(2) },
  { id: 'u_advisor', email: 'advisor@demo.basecase.local', displayName: 'Avery Advisor', role: 'advisor', status: 'active', mfaEnabled: false, createdAt: ago(800), lastLoginAt: ago(30), clientIds: [] },
];

const personaClients = PERSONAS.map((p, i) => ({
  user: {
    id: `u_client_${p.key}`,
    email: p.email || `${p.key}@demo.basecase.local`,
    displayName: p.name,
    role: 'client' as const,
    status: 'active' as const,
    mfaEnabled: false,
    createdAt: ago(700 - i),
    lastLoginAt: i === 0 ? ago(5) : null,
    advisorIds: ['u_advisor'],
  },
  state: mergePlanState(p.state),
}));
for (const pc of personaClients) users.push(pc.user);
users[1].clientIds = personaClients.map((p) => p.user.id);

const plans = new Map<string, PlanRecord>();
const planVersions = new Map<string, PlanVersionSummary[]>();
for (const pc of personaClients) {
  const st = clone(pc.state);
  if (!st.profile.nickname) st.profile.nickname = pc.user.displayName.split(' ')[0];
  plans.set(pc.user.id, { clientId: pc.user.id, version: 1, state: st, updatedAt: ago(48), updatedById: 'u_advisor', updatedByName: 'Avery Advisor' });
  planVersions.set(pc.user.id, [{ version: 1, createdAt: ago(48), createdByName: 'Avery Advisor', reason: 'Initial intake' }]);
}

const firstClient = personaClients[0]?.user;
const proposals: Proposal[] = [];
if (firstClient) {
  const approved = plans.get(firstClient.id)!;
  const submittedState = clone(approved.state);
  submittedState.savings.deferralPct = Math.min(0.5, approved.state.savings.deferralPct + 0.04);
  submittedState.savings.iraContribution = 3000;
  submittedState.profile.livingExpenses = Math.round(approved.state.profile.livingExpenses * 0.95);
  proposals.push({
    id: 'p_submitted', clientId: firstClient.id, clientName: firstClient.displayName, authorId: firstClient.id, authorName: firstClient.displayName,
    title: 'Raise 401(k) deferral and start an IRA', note: 'Got a raise; want to see if I can afford both.', status: 'submitted', reviewNote: null,
    reviewerId: null, reviewerName: null, baseVersion: 1, createdAt: ago(20), updatedAt: ago(4), submittedAt: ago(4), reviewedAt: null, state: submittedState,
  });
  const draftState = clone(approved.state);
  draftState.whatIf.spendingCut = 2400;
  proposals.push({
    id: 'p_draft', clientId: firstClient.id, clientName: firstClient.displayName, authorId: firstClient.id, authorName: firstClient.displayName,
    title: 'Draft', note: '', status: 'draft', reviewNote: null, reviewerId: null, reviewerName: null, baseVersion: 1, createdAt: ago(3), updatedAt: ago(1),
    submittedAt: null, reviewedAt: null, state: draftState,
  });
}

const threads: ChatThread[] = firstClient
  ? [{
      id: 't_1', clientId: firstClient.id, title: 'Emergency fund question', createdAt: ago(40), updatedAt: ago(39), messageCount: 2,
      messages: [
        { id: 'm_1', role: 'user', content: 'Why six months for my emergency fund?', createdAt: ago(40), mode: 'offline' },
        { id: 'm_2', role: 'assistant', content: 'Your emergency-fund target comes from the supplement answers: a volatile industry and bonus-heavy pay push the target up from the three-month baseline. The number itself is computed by the plan engine, not by me.', createdAt: ago(39), mode: 'offline' },
      ],
    }]
  : [];

const audit: AuditEntry[] = [];
function log(action: string, actor: UserSummary | null, targetType: string | null = null, targetId: string | null = null, metadata: Row = {}): void {
  audit.unshift({ id: nid('a'), at: now(), actorId: actor?.id ?? null, actorName: actor?.displayName ?? null, action, targetType, targetId, ip: '127.0.0.1', metadata });
}
for (let i = 0; i < 64; i++) {
  const actor = users[i % users.length];
  const actions = ['auth.login', 'plan.view', 'proposal.update', 'proposal.submit', 'auth.logout', 'admin.settings.update', 'plan.put'];
  audit.push({ id: `a_seed_${i}`, at: ago(i * 7 + 1), actorId: actor.id, actorName: actor.displayName, action: actions[i % actions.length], targetType: i % 3 === 0 ? 'proposal' : 'plan', targetId: i % 3 === 0 ? 'p_submitted' : firstClient?.id ?? null, ip: '10.0.0.' + (i % 9 + 1), metadata: { userAgent: 'Mozilla/5.0', seq: i } });
}

let settings: SettingsRecord = {
  firmName: 'Base Case Demo Advisors',
  disclaimer: 'Projections are educational estimates based on your inputs and public data; they are not guarantees or individualized advice.',
  assistantEnabled: true,
  inviteExpiryHours: 72,
  sessionHours: 12,
  requireMfaForStaff: true,
};

const sessions: SessionInfo[] = [
  { id: 's_cur', createdAt: ago(2), lastSeenAt: now(), userAgent: 'Chrome 142 on macOS', current: true },
  { id: 's_old', createdAt: ago(80), lastSeenAt: ago(26), userAgent: 'Safari on iPhone', current: false },
];

const invites = new Map<string, { email: string; displayName: string; role: UserSummary['role']; userId: string; expiresAt: string }>();

let currentUserId: string | null = 'u_admin';
let mfaPending = false;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function me(): UserSummary {
  const u = users.find((x) => x.id === currentUserId);
  if (!u) throw new ApiError(401, 'Not signed in', 'unauthorized');
  return u;
}
function requireStaff(): UserSummary {
  const u = me();
  if (u.role === 'client') throw new ApiError(403, 'Staff only', 'forbidden');
  return u;
}
function summary(p: Proposal): Omit<Proposal, 'state'> {
  const { state: _s, ...rest } = p;
  return rest;
}
function clientItem(u: UserSummary): ClientListItem {
  const plan = plans.get(u.id);
  return {
    id: u.id, displayName: u.displayName, email: u.email, status: u.status, planVersion: plan?.version ?? 0, planUpdatedAt: plan?.updatedAt ?? null,
    pendingProposals: proposals.filter((p) => p.clientId === u.id && p.status === 'submitted').length,
    advisorNames: (u.advisorIds ?? []).map((id) => users.find((x) => x.id === id)?.displayName ?? id), lastLoginAt: u.lastLoginAt,
  };
}
function visibleClients(u: UserSummary): UserSummary[] {
  const all = users.filter((x) => x.role === 'client');
  if (u.role === 'admin') return all;
  return all.filter((c) => (c.advisorIds ?? []).includes(u.id));
}
function offlineReply(content: string, state: PlanState): string {
  const t = content.toLowerCase();
  if (t.includes('emergency')) return `Your emergency-fund target is ${state.assumptions.emergencyMonthsDefault} months of essentials by default, adjusted by the supplement answers. The PLAN screen shows the target and the current balance side by side.`;
  if (t.includes('401') || t.includes('defer')) return `You currently defer ${(state.savings.deferralPct * 100).toFixed(0)}% of pay. The playbook prioritises capturing the full employer match before other savings; see the order of operations on the PLAN screen.`;
  if (t.includes('retire')) return `Your plan retires at ${state.whatIf.retireAtOverride ?? state.profile.retirementAge}. The FUTURE screen shows the P10/P50/P90 cone and the probability of success for that age.`;
  return 'I am the offline explainer: I can describe how a number on your plan is produced and where its data comes from, but every figure comes from the plan engine, not from me. Try asking about your emergency fund, 401(k) deferral or retirement age.';
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------------------------
export async function mockRequest(method: Method, rawPath: string, body?: unknown): Promise<unknown> {
  await delay(40);
  const url = new URL(rawPath, 'http://mock.local');
  const path = url.pathname;
  const qs = url.searchParams;
  const b = (body ?? {}) as Row;
  const seg = path.split('/').filter(Boolean); // ['api', ...]
  const key = `${method} ${seg.slice(0, 3).join('/')}`;

  if (path === '/api/health') return { ok: true, mock: true };

  // ---- auth
  if (method === 'POST' && path === '/api/auth/login') {
    const u = users.find((x) => x.email.toLowerCase() === String(b.email ?? '').toLowerCase());
    if (!u || !b.password) throw new ApiError(401, 'Incorrect email or password', 'bad_credentials');
    if (u.status === 'disabled') throw new ApiError(403, 'This account is disabled', 'disabled');
    currentUserId = u.id;
    mfaPending = u.mfaEnabled;
    u.lastLoginAt = now();
    log('auth.login', u);
    return { ok: true, mfaRequired: u.mfaEnabled, user: u };
  }
  if (method === 'POST' && path === '/api/auth/mfa/verify') {
    me();
    if (!/^\d{6}$/.test(String(b.code ?? ''))) throw new ApiError(400, 'Enter the 6-digit code from your authenticator app', 'bad_code');
    mfaPending = false;
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    const u = users.find((x) => x.id === currentUserId) ?? null;
    log('auth.logout', u);
    currentUserId = null;
    mfaPending = false;
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/me') {
    const u = me();
    const res: MeResponse = { user: clone(u), firm: { name: settings.firmName, assistantMode: settings.assistantEnabled ? 'offline' : 'offline', dataAsOf: '2026-11' }, mfaPending };
    return res;
  }
  if (method === 'GET' && seg[2] === 'invite' && seg[1] === 'auth') {
    const inv = invites.get(seg[3] ?? '');
    if (!inv) {
      if (seg[3] === 'demo') return { email: 'new.client@example.com', displayName: 'New Client', role: 'client', expiresAt: ago(-72) };
      throw new ApiError(404, 'This invite link is invalid or has expired', 'invite_invalid');
    }
    return inv;
  }
  if (method === 'POST' && path === '/api/auth/accept-invite') {
    const inv = invites.get(String(b.token ?? ''));
    if (!inv && b.token !== 'demo') throw new ApiError(404, 'This invite link is invalid or has expired', 'invite_invalid');
    if (String(b.password ?? '').length < 12) throw new ApiError(400, 'Password must be at least 12 characters', 'weak_password');
    if (inv) {
      const u = users.find((x) => x.id === inv.userId);
      if (u) {
        u.status = 'active';
        u.displayName = String(b.displayName || inv.displayName);
        currentUserId = u.id;
      }
      invites.delete(String(b.token));
    }
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/auth/change-password') {
    me();
    if (String(b.newPassword ?? '').length < 12) throw new ApiError(400, 'New password must be at least 12 characters', 'weak_password');
    if (!b.currentPassword) throw new ApiError(400, 'Enter your current password', 'bad_password');
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/auth/mfa/setup') {
    const u = me();
    const otpauthUrl = `otpauth://totp/BaseCase:${encodeURIComponent(u.email)}?secret=JBSWY3DPEHPK3PXP&issuer=BaseCase`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 21' shape-rendering='crispEdges'><rect width='21' height='21' fill='#fff'/>${Array.from({ length: 160 }, (_, i) => ((i * 7919) % 5 === 0 ? `<rect x='${(i * 13) % 21}' y='${(i * 5) % 21}' width='1' height='1' fill='#1A1A1A'/>` : '')).join('')}<rect x='1' y='1' width='5' height='5' fill='none' stroke='#1A1A1A'/><rect x='15' y='1' width='5' height='5' fill='none' stroke='#1A1A1A'/><rect x='1' y='15' width='5' height='5' fill='none' stroke='#1A1A1A'/></svg>`;
    return { otpauthUrl, qrDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
  }
  if (method === 'POST' && path === '/api/auth/mfa/enable') {
    const u = me();
    if (!/^\d{6}$/.test(String(b.code ?? ''))) throw new ApiError(400, 'Enter the 6-digit code', 'bad_code');
    u.mfaEnabled = true;
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/auth/mfa/disable') {
    const u = me();
    u.mfaEnabled = false;
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/auth/sessions') {
    me();
    return sessions;
  }
  if (method === 'DELETE' && seg[2] === 'sessions') {
    me();
    const i = sessions.findIndex((s) => s.id === seg[3]);
    if (i >= 0 && !sessions[i].current) sessions.splice(i, 1);
    return { ok: true };
  }

  // ---- admin
  if (method === 'GET' && path === '/api/admin/users') {
    const u = me();
    if (u.role !== 'admin') throw new ApiError(403, 'Admin only', 'forbidden');
    return users;
  }
  if (method === 'POST' && path === '/api/admin/invites') {
    const actor = me();
    if (actor.role !== 'admin') throw new ApiError(403, 'Admin only', 'forbidden');
    const email = String(b.email ?? '').trim();
    if (!email.includes('@')) throw new ApiError(400, 'Enter a valid email', 'bad_email');
    if (users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new ApiError(409, 'A user with that email already exists', 'duplicate');
    const role = (b.role as UserSummary['role']) ?? 'client';
    const nu: UserSummary = { id: nid('u'), email, displayName: String(b.displayName || email.split('@')[0]), role, status: 'invited', mfaEnabled: false, createdAt: now(), lastLoginAt: null, advisorIds: role === 'client' && b.advisorId ? [String(b.advisorId)] : undefined, clientIds: role === 'advisor' ? [] : undefined };
    users.push(nu);
    if (role === 'client') {
      plans.set(nu.id, { clientId: nu.id, version: 0, state: defaultPlanState(), updatedAt: now(), updatedById: null, updatedByName: null });
      if (b.advisorId) {
        const adv = users.find((x) => x.id === b.advisorId);
        if (adv) adv.clientIds = [...(adv.clientIds ?? []), nu.id];
      }
    }
    const token = nid('inv');
    const expiresAt = new Date(Date.now() + settings.inviteExpiryHours * 3600_000).toISOString();
    invites.set(token, { email, displayName: nu.displayName, role, userId: nu.id, expiresAt });
    log('admin.invite', actor, 'user', nu.id, { role });
    const res: InviteResponse = { inviteUrl: `${window.location.origin}/invite/${token}`, expiresAt, userId: nu.id };
    return res;
  }
  if (method === 'PATCH' && seg[1] === 'admin' && seg[2] === 'users' && seg[3]) {
    const actor = me();
    if (actor.role !== 'admin') throw new ApiError(403, 'Admin only', 'forbidden');
    const u = users.find((x) => x.id === seg[3]);
    if (!u) throw new ApiError(404, 'User not found', 'not_found');
    if (typeof b.role === 'string') u.role = b.role as UserSummary['role'];
    if (typeof b.status === 'string') u.status = b.status as UserSummary['status'];
    if (typeof b.displayName === 'string') u.displayName = b.displayName;
    log('admin.user.update', actor, 'user', u.id, b);
    return u;
  }
  if (method === 'POST' && seg[1] === 'admin' && seg[2] === 'users' && seg[4] === 'reset-password') {
    const actor = me();
    const token = nid('inv');
    const u = users.find((x) => x.id === seg[3]);
    if (!u) throw new ApiError(404, 'User not found', 'not_found');
    invites.set(token, { email: u.email, displayName: u.displayName, role: u.role, userId: u.id, expiresAt: ago(-24) });
    log('admin.user.reset', actor, 'user', u.id);
    return { ok: true, inviteUrl: `${window.location.origin}/invite/${token}` };
  }
  if (path === '/api/admin/assignments' && (method === 'POST' || method === 'DELETE')) {
    const actor = me();
    if (actor.role !== 'admin') throw new ApiError(403, 'Admin only', 'forbidden');
    const c = users.find((x) => x.id === b.clientId);
    const a = users.find((x) => x.id === b.advisorId);
    if (!c || !a) throw new ApiError(404, 'User not found', 'not_found');
    if (method === 'POST') {
      c.advisorIds = Array.from(new Set([...(c.advisorIds ?? []), a.id]));
      a.clientIds = Array.from(new Set([...(a.clientIds ?? []), c.id]));
    } else {
      c.advisorIds = (c.advisorIds ?? []).filter((x) => x !== a.id);
      a.clientIds = (a.clientIds ?? []).filter((x) => x !== c.id);
    }
    log(method === 'POST' ? 'admin.assign' : 'admin.unassign', actor, 'user', c.id, { advisorId: a.id });
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/admin/audit') {
    const u = me();
    if (u.role !== 'admin') throw new ApiError(403, 'Admin only', 'forbidden');
    const limit = Math.min(200, Number(qs.get('limit') ?? 50));
    const before = qs.get('before');
    let start = 0;
    if (before) {
      const i = audit.findIndex((a) => a.id === before);
      start = i >= 0 ? i + 1 : 0;
    }
    const entries = audit.slice(start, start + limit);
    return { entries, nextBefore: start + limit < audit.length ? entries[entries.length - 1]?.id ?? null : null };
  }
  if (path === '/api/admin/settings') {
    const u = me();
    if (u.role !== 'admin') throw new ApiError(403, 'Admin only', 'forbidden');
    if (method === 'PATCH') {
      settings = { ...settings, ...(b as Partial<SettingsRecord>) };
      log('admin.settings.update', u, 'settings', null, b);
    }
    return settings;
  }

  // ---- clients
  if (method === 'GET' && path === '/api/clients') {
    const u = requireStaff();
    return visibleClients(u).map(clientItem);
  }
  if (method === 'GET' && seg[1] === 'clients' && seg[2]) {
    const u = requireStaff();
    const c = visibleClients(u).find((x) => x.id === seg[2]);
    if (!c) throw new ApiError(404, 'Client not found', 'not_found');
    const res: ClientDetail = { client: c, plan: plans.get(c.id) ?? null, proposals: proposals.filter((p) => p.clientId === c.id).map(summary) };
    return res;
  }

  // ---- plans
  if (seg[1] === 'plans') {
    const u = me();
    const clientId = seg[2] === 'me' ? u.id : seg[2];
    if (u.role === 'client' && clientId !== u.id) throw new ApiError(403, 'Not your plan', 'forbidden');
    if (u.role === 'advisor' && !visibleClients(u).some((c) => c.id === clientId)) throw new ApiError(403, 'Not your client', 'forbidden');
    if (method === 'GET' && !seg[3]) {
      const p = plans.get(clientId);
      if (!p) throw new ApiError(404, 'No plan yet', 'not_found');
      return p;
    }
    if (method === 'PUT' && !seg[3]) {
      if (u.role === 'client') throw new ApiError(403, 'Clients submit proposals instead of editing the approved plan', 'forbidden');
      const prev = plans.get(clientId);
      const rec: PlanRecord = { clientId, version: (prev?.version ?? 0) + 1, state: mergePlanState(b.state), updatedAt: now(), updatedById: u.id, updatedByName: u.displayName };
      plans.set(clientId, rec);
      planVersions.set(clientId, [...(planVersions.get(clientId) ?? []), { version: rec.version, createdAt: rec.updatedAt, createdByName: u.displayName, reason: String(b.reason ?? 'Advisor edit') }]);
      log('plan.put', u, 'plan', clientId, { version: rec.version });
      return rec;
    }
    if (method === 'GET' && seg[3] === 'versions' && !seg[4]) return planVersions.get(clientId) ?? [];
    if (method === 'GET' && seg[3] === 'versions' && seg[4]) {
      const p = plans.get(clientId);
      if (!p) throw new ApiError(404, 'Not found', 'not_found');
      return { ...p, version: Number(seg[4]) };
    }
  }

  // ---- proposals
  if (method === 'GET' && path === '/api/proposals') {
    const u = me();
    let list = proposals.filter((p) => (u.role === 'client' ? p.clientId === u.id : visibleClients(u).some((c) => c.id === p.clientId)));
    const cid = qs.get('clientId');
    const st = qs.get('status');
    if (cid) list = list.filter((p) => p.clientId === cid);
    if (st) list = list.filter((p) => st.split(',').includes(p.status));
    return list.map(summary).sort((a, c) => c.updatedAt.localeCompare(a.updatedAt));
  }
  if (method === 'POST' && path === '/api/proposals') {
    const u = me();
    const clientId = u.role === 'client' ? u.id : String(b.clientId ?? '');
    const c = users.find((x) => x.id === clientId);
    if (!c) throw new ApiError(400, 'clientId required', 'bad_request');
    const base = plans.get(clientId);
    const p: Proposal = {
      id: nid('p'), clientId, clientName: c.displayName, authorId: u.id, authorName: u.displayName, title: String(b.title || 'Draft'), note: String(b.note ?? ''),
      status: 'draft', reviewNote: null, reviewerId: null, reviewerName: null, baseVersion: base?.version ?? 0, createdAt: now(), updatedAt: now(), submittedAt: null, reviewedAt: null,
      state: b.state ? mergePlanState(b.state) : clone(base?.state ?? defaultPlanState()),
    };
    proposals.unshift(p);
    log('proposal.create', u, 'proposal', p.id);
    return p;
  }
  if (seg[1] === 'proposals' && seg[2]) {
    const u = me();
    const p = proposals.find((x) => x.id === seg[2]);
    if (!p) throw new ApiError(404, 'Proposal not found', 'not_found');
    if (u.role === 'client' && p.clientId !== u.id) throw new ApiError(403, 'Not yours', 'forbidden');
    const action = seg[3];
    if (method === 'GET' && !action) return p;
    if (method === 'PUT' && !action) {
      if (p.status !== 'draft') throw new ApiError(409, 'Only drafts can be edited', 'not_draft');
      if (b.state) p.state = mergePlanState(b.state);
      if (typeof b.title === 'string') p.title = b.title;
      if (typeof b.note === 'string') p.note = b.note;
      p.updatedAt = now();
      return p;
    }
    if (method === 'DELETE' && !action) {
      const i = proposals.indexOf(p);
      proposals.splice(i, 1);
      log('proposal.delete', u, 'proposal', p.id);
      return { ok: true };
    }
    if (method === 'POST' && action === 'submit') {
      if (p.status !== 'draft') throw new ApiError(409, 'Only drafts can be submitted', 'not_draft');
      if (typeof b.title === 'string' && b.title) p.title = b.title;
      if (typeof b.note === 'string') p.note = b.note;
      p.status = 'submitted';
      p.submittedAt = now();
      p.updatedAt = now();
      log('proposal.submit', u, 'proposal', p.id);
      return p;
    }
    if (method === 'POST' && action === 'withdraw') {
      if (p.status !== 'submitted') throw new ApiError(409, 'Only submitted proposals can be withdrawn', 'not_submitted');
      p.status = 'withdrawn';
      p.updatedAt = now();
      log('proposal.withdraw', u, 'proposal', p.id);
      return p;
    }
    if (method === 'POST' && (action === 'approve' || action === 'reject')) {
      requireStaff();
      if (p.status !== 'submitted') throw new ApiError(409, 'Only submitted proposals can be reviewed', 'not_submitted');
      p.status = action === 'approve' ? 'approved' : 'rejected';
      p.reviewNote = String(b.note ?? '');
      p.reviewerId = u.id;
      p.reviewerName = u.displayName;
      p.reviewedAt = now();
      p.updatedAt = now();
      if (action === 'approve') {
        const prev = plans.get(p.clientId);
        const rec: PlanRecord = { clientId: p.clientId, version: (prev?.version ?? 0) + 1, state: clone(p.state), updatedAt: now(), updatedById: u.id, updatedByName: u.displayName };
        plans.set(p.clientId, rec);
        planVersions.set(p.clientId, [...(planVersions.get(p.clientId) ?? []), { version: rec.version, createdAt: rec.updatedAt, createdByName: u.displayName, reason: `Approved proposal: ${p.title}` }]);
      }
      log(`proposal.${action}`, u, 'proposal', p.id);
      return p;
    }
  }

  // ---- chat
  if (method === 'GET' && path === '/api/chat/threads') {
    const u = me();
    const cid = u.role === 'client' ? u.id : qs.get('clientId');
    return threads.filter((t) => !cid || t.clientId === cid).map(({ messages: _m, ...rest }) => rest);
  }
  if (method === 'POST' && path === '/api/chat/threads') {
    const u = me();
    const clientId = u.role === 'client' ? u.id : String(b.clientId ?? firstClient?.id ?? '');
    const t: ChatThread = { id: nid('t'), clientId, title: String(b.title || 'New conversation'), createdAt: now(), updatedAt: now(), messageCount: 0, messages: [] };
    threads.unshift(t);
    return t;
  }
  if (seg[1] === 'chat' && seg[2] === 'threads' && seg[3]) {
    const u = me();
    const t = threads.find((x) => x.id === seg[3]);
    if (!t) throw new ApiError(404, 'Thread not found', 'not_found');
    if (method === 'GET') return t;
    if (method === 'DELETE') {
      threads.splice(threads.indexOf(t), 1);
      return { ok: true };
    }
    if (method === 'POST' && seg[4] === 'messages') {
      const content = String(b.content ?? '').trim();
      if (!content) throw new ApiError(400, 'Message is empty', 'bad_request');
      const draftState = typeof b.proposalId === 'string' ? proposals.find((p) => p.id === b.proposalId)?.state : undefined;
      const state: PlanState = draftState ?? plans.get(t.clientId)?.state ?? defaultPlanState();
      const message: ChatMessage = { id: nid('m'), role: 'user', content, createdAt: now(), mode: 'offline' };
      const reply: ChatMessage = { id: nid('m'), role: 'assistant', content: offlineReply(content, state), createdAt: now(), mode: 'offline' };
      t.messages.push(message, reply);
      t.messageCount = t.messages.length;
      t.updatedAt = now();
      if (t.messages.length === 2) t.title = content.slice(0, 48);
      log('chat.send', u, 'thread', t.id);
      return { message, reply };
    }
  }

  // ---- data
  if (method === 'GET' && path === '/api/data/status') {
    const res: DataStatus = { asOf: { irs: '2025-11', tax: '2025-10', wages: '2025-05', loans: '2026-07', ssa: '2026-10' }, unverifiedCount: 9, totalCount: 41, staleCount: 1 };
    return res;
  }

  throw new ApiError(404, `Mock: no route for ${key}`, 'not_found');
}
