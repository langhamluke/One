/**
 * AUTHORIZATION MATRIX. Visibility denials are 404 (anti-enumeration), action denials on visible resources are 403.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeApp, createUser, assign, req, login, json, type TestApp } from './helpers';
import { auditLog, planVersions } from '../../server/db/schema';
import { defaultPlanState } from '../../shared/lib/inputs';

const PW = 'Matrix-Password-2026!';

describe('authorization matrix', () => {
  let t: TestApp;
  let adminId: string, aId: string, bId: string, xId: string, yId: string;
  let admin: string, A: string, B: string, X: string, Y: string;

  beforeAll(async () => {
    t = await makeApp();
    adminId = await createUser(t, { email: 'admin@m.test', password: PW, role: 'admin', displayName: 'Admin' });
    aId = await createUser(t, { email: 'a@m.test', password: PW, role: 'advisor', displayName: 'Advisor A' });
    bId = await createUser(t, { email: 'b@m.test', password: PW, role: 'advisor', displayName: 'Advisor B' });
    xId = await createUser(t, { email: 'x@m.test', password: PW, role: 'client', displayName: 'Client X' });
    yId = await createUser(t, { email: 'y@m.test', password: PW, role: 'client', displayName: 'Client Y' });
    await assign(t, aId, xId);
    await assign(t, bId, yId);
    [admin, A, B, X, Y] = await Promise.all([
      login(t, 'admin@m.test', PW, '20.0.0.1'),
      login(t, 'a@m.test', PW, '20.0.0.2'),
      login(t, 'b@m.test', PW, '20.0.0.3'),
      login(t, 'x@m.test', PW, '20.0.0.4'),
      login(t, 'y@m.test', PW, '20.0.0.5'),
    ]);
  });
  afterAll(() => t.close());

  const status = async (cookie: string, method: string, path: string, body?: unknown) => (await req(t, method, path, { cookie, body })).status;

  it('plans: X reads own, not Y (404); A reads X not Y; B the reverse; admin both', async () => {
    expect(await status(X, 'GET', '/api/plans/me')).toBe(200);
    expect(await status(X, 'GET', `/api/plans/${xId}`)).toBe(200);
    expect(await status(X, 'GET', `/api/plans/${yId}`)).toBe(404);
    expect(await status(Y, 'GET', `/api/plans/${xId}`)).toBe(404);
    expect(await status(A, 'GET', `/api/plans/${xId}`)).toBe(200);
    expect(await status(A, 'GET', `/api/plans/${yId}`)).toBe(404);
    expect(await status(B, 'GET', `/api/plans/${yId}`)).toBe(200);
    expect(await status(B, 'GET', `/api/plans/${xId}`)).toBe(404);
    expect(await status(admin, 'GET', `/api/plans/${xId}`)).toBe(200);
    expect(await status(admin, 'GET', `/api/plans/${yId}`)).toBe(200);
    // non-existent / non-client ids are also 404, indistinguishable from "not yours"
    expect(await status(A, 'GET', `/api/plans/${aId}`)).toBe(404);
    expect(await status(admin, 'GET', '/api/plans/00000000-0000-4000-8000-000000000000')).toBe(404);
    expect(await status(A, 'GET', '/api/plans/me')).toBe(404);
  });

  it('clients list/detail respect assignments', async () => {
    const a = await json(await req(t, 'GET', '/api/clients', { cookie: A }));
    expect(a.map((c: any) => c.id)).toEqual([xId]);
    expect(a[0].advisorNames).toEqual(['Advisor A']);
    const b = await json(await req(t, 'GET', '/api/clients', { cookie: B }));
    expect(b.map((c: any) => c.id)).toEqual([yId]);
    const all = await json(await req(t, 'GET', '/api/clients', { cookie: admin }));
    expect(all.map((c: any) => c.id).sort()).toEqual([xId, yId].sort());
    expect(await status(X, 'GET', '/api/clients')).toBe(403);
    expect(await status(A, 'GET', `/api/clients/${xId}`)).toBe(200);
    expect(await status(A, 'GET', `/api/clients/${yId}`)).toBe(404);
    expect(await status(B, 'GET', `/api/clients/${xId}`)).toBe(404);
  });

  it('direct PUT plan: X forbidden (403), B 404, A allowed with version bump + plan_versions row; admin too', async () => {
    const state = defaultPlanState();
    state.profile.nickname = 'Xavier';
    state.savings.deferralPct = 0.08;
    expect(await status(X, 'PUT', `/api/plans/${xId}`, state)).toBe(403);
    expect(await status(B, 'PUT', `/api/plans/${xId}`, state)).toBe(404);
    const r = await req(t, 'PUT', `/api/plans/${xId}`, { cookie: A, body: state });
    expect(r.status).toBe(200);
    const rec = await json(r);
    expect(rec.version).toBe(1);
    expect(rec.state.profile.nickname).toBe('Xavier');
    expect(rec.updatedById).toBe(aId);
    expect(rec.updatedByName).toBe('Advisor A');
    const r2 = await req(t, 'PUT', `/api/plans/${xId}`, { cookie: admin, body: { state: { ...state, notes: 'admin edit' }, reason: 'fix typo' } });
    expect((await json(r2)).version).toBe(2);
    const versions = await t.deps.db.select().from(planVersions).where(eq(planVersions.clientId, xId));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    expect(versions.find((v) => v.version === 1)!.reason).toBe('direct-edit');
    expect(versions.find((v) => v.version === 2)!.reason).toBe('direct-edit: fix typo');
    // ciphertext at rest: no plaintext nickname in the row
    expect(versions[0].stateEnc).not.toContain('Xavier');
    const list = await json(await req(t, 'GET', `/api/plans/${xId}/versions`, { cookie: X }));
    expect(list.length).toBe(2);
    expect(list[0].version).toBe(2);
    const v1 = await json(await req(t, 'GET', `/api/plans/${xId}/versions/1`, { cookie: A }));
    expect(v1.state.profile.nickname).toBe('Xavier');
    expect(await status(B, 'GET', `/api/plans/${xId}/versions`)).toBe(404);
    // client sees the approved plan
    const mine = await json(await req(t, 'GET', '/api/plans/me', { cookie: X }));
    expect(mine.version).toBe(2);
    expect(mine.state.notes).toBe('admin edit');
  });

  it('audit rows are written for advisor/admin plan reads, not for the client reading their own', async () => {
    const query = () => t.deps.db.select().from(auditLog).where(and(eq(auditLog.action, 'plan.read'), eq(auditLog.targetId, xId)));
    const seen = new Set((await query()).map((r) => r.id));
    await req(t, 'GET', `/api/plans/${xId}`, { cookie: A });
    await req(t, 'GET', `/api/clients/${xId}`, { cookie: admin });
    await req(t, 'GET', '/api/plans/me', { cookie: X });
    await req(t, 'GET', `/api/plans/${xId}`, { cookie: X });
    const rows = (await query()).filter((r) => !seen.has(r.id));
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.actorId).sort()).toEqual([adminId, aId].sort());
    for (const r of rows) expect(JSON.stringify(r.metadata)).not.toContain('nickname');
    const writes = await t.deps.db.select().from(auditLog).where(eq(auditLog.action, 'plan.write'));
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  it('proposals: X creates/updates/submits own, cannot approve own; A approves X, cannot touch Y; Y/B cannot see X', async () => {
    const state = defaultPlanState();
    state.savings.deferralPct = 0.1;
    // X cannot create for Y
    expect(await status(X, 'POST', '/api/proposals', { clientId: yId, title: 'sneaky', state })).toBe(404);
    const created = await req(t, 'POST', '/api/proposals', { cookie: X, body: { title: 'Raise deferral', note: 'to 10%', state } });
    expect(created.status).toBe(201);
    const p = await json(created);
    expect(p.status).toBe('draft');
    expect(p.clientId).toBe(xId);
    expect(p.authorId).toBe(xId);
    expect(p.baseVersion).toBe(2);
    expect(p.state.savings.deferralPct).toBe(0.1);

    // visibility
    expect(await status(Y, 'GET', `/api/proposals/${p.id}`)).toBe(404);
    expect(await status(B, 'GET', `/api/proposals/${p.id}`)).toBe(404);
    expect(await status(A, 'GET', `/api/proposals/${p.id}`)).toBe(200);
    expect(await status(admin, 'GET', `/api/proposals/${p.id}`)).toBe(200);
    expect((await json(await req(t, 'GET', '/api/proposals', { cookie: B }))).length).toBe(0);
    expect((await json(await req(t, 'GET', '/api/proposals', { cookie: A }))).map((x: any) => x.id)).toEqual([p.id]);
    expect((await json(await req(t, 'GET', `/api/proposals?clientId=${xId}&status=draft`, { cookie: admin }))).length).toBe(1);
    expect(await status(B, 'GET', `/api/proposals?clientId=${xId}`)).toBe(404);

    // update own draft
    const upd = await req(t, 'PUT', `/api/proposals/${p.id}`, { cookie: X, body: { title: 'Raise deferral to 10%', state: { ...state, notes: 'please review' } } });
    expect(upd.status).toBe(200);
    expect((await json(upd)).title).toBe('Raise deferral to 10%');
    expect(await status(Y, 'PUT', `/api/proposals/${p.id}`, { title: 'hijack' })).toBe(404);

    // cannot approve a draft (409), cannot approve own (403 once submitted)
    expect(await status(A, 'POST', `/api/proposals/${p.id}/approve`)).toBe(409);
    expect(await status(X, 'POST', `/api/proposals/${p.id}/submit`)).toBe(200);
    expect(await status(X, 'POST', `/api/proposals/${p.id}/approve`)).toBe(403);
    expect(await status(X, 'POST', `/api/proposals/${p.id}/reject`, { note: 'no' })).toBe(403);
    expect(await status(B, 'POST', `/api/proposals/${p.id}/approve`)).toBe(404);
    expect(await status(X, 'PUT', `/api/proposals/${p.id}`, { title: 'edit after submit' })).toBe(409);
    expect(await status(X, 'DELETE', `/api/proposals/${p.id}`)).toBe(409);

    // A approves -> plan version 3 with proposal state; plan_versions reason proposal:<id>
    const appr = await req(t, 'POST', `/api/proposals/${p.id}/approve`, { cookie: A, body: { note: 'looks good' } });
    expect(appr.status).toBe(200);
    const approved = await json(appr);
    expect(approved.status).toBe('approved');
    expect(approved.reviewerId).toBe(aId);
    expect(approved.reviewerName).toBe('Advisor A');
    expect(approved.reviewNote).toBe('looks good');
    const plan = await json(await req(t, 'GET', '/api/plans/me', { cookie: X }));
    expect(plan.version).toBe(3);
    expect(plan.state.savings.deferralPct).toBe(0.1);
    expect(plan.state.notes).toBe('please review');
    const [v3] = await t.deps.db.select().from(planVersions).where(and(eq(planVersions.clientId, xId), eq(planVersions.version, 3)));
    expect(v3.reason).toBe(`proposal:${p.id}`);
    expect(await status(A, 'POST', `/api/proposals/${p.id}/approve`)).toBe(409);

    // advisor-authored proposal for X: A cannot approve their own, admin can; B cannot create for X
    expect(await status(B, 'POST', '/api/proposals', { clientId: xId, title: 'nope' })).toBe(404);
    expect(await status(A, 'POST', '/api/proposals', { title: 'missing client' })).toBe(400);
    const ap = await json(await req(t, 'POST', '/api/proposals', { cookie: A, body: { clientId: xId, title: 'Advisor idea' } }));
    expect(ap.baseVersion).toBe(3);
    expect(ap.state.savings.deferralPct).toBe(0.1); // defaults to the current plan
    expect(await status(X, 'GET', `/api/proposals/${ap.id}`)).toBe(200); // client can see it
    expect(await status(X, 'PUT', `/api/proposals/${ap.id}`, { title: 'client edits advisor draft' })).toBe(403);
    expect(await status(A, 'POST', `/api/proposals/${ap.id}/submit`)).toBe(200);
    expect(await status(A, 'POST', `/api/proposals/${ap.id}/approve`)).toBe(403);
    expect(await status(X, 'POST', `/api/proposals/${ap.id}/approve`)).toBe(403);
    const rej = await req(t, 'POST', `/api/proposals/${ap.id}/reject`, { cookie: admin, body: { note: 'not now' } });
    expect((await json(rej)).status).toBe('rejected');
    // rejected -> editable again -> back to draft; withdraw flow; delete
    expect((await json(await req(t, 'PUT', `/api/proposals/${ap.id}`, { cookie: A, body: { note: 'second try' } }))).status).toBe('draft');
    expect(await status(A, 'POST', `/api/proposals/${ap.id}/submit`)).toBe(200);
    expect(await status(X, 'POST', `/api/proposals/${ap.id}/withdraw`)).toBe(403);
    expect(await status(A, 'POST', `/api/proposals/${ap.id}/withdraw`)).toBe(200);
    expect(await status(Y, 'DELETE', `/api/proposals/${ap.id}`)).toBe(404);
    expect(await status(A, 'DELETE', `/api/proposals/${ap.id}`)).toBe(200);
    expect(await status(A, 'GET', `/api/proposals/${ap.id}`)).toBe(404);

    const actions = (await t.deps.db.select().from(auditLog)).map((r) => r.action);
    for (const a of ['proposal.created', 'proposal.updated', 'proposal.submitted', 'proposal.approved', 'proposal.rejected', 'proposal.withdrawn', 'proposal.deleted']) expect(actions).toContain(a);
  });

  it('assignments change access; admin assignment endpoints validate roles', async () => {
    expect(await status(admin, 'POST', '/api/admin/assignments', { advisorId: bId, clientId: xId })).toBe(200);
    expect(await status(B, 'GET', `/api/plans/${xId}`)).toBe(200);
    expect(await status(admin, 'DELETE', '/api/admin/assignments', { advisorId: bId, clientId: xId })).toBe(200);
    expect(await status(B, 'GET', `/api/plans/${xId}`)).toBe(404);
    expect(await status(admin, 'POST', '/api/admin/assignments', { advisorId: xId, clientId: yId })).toBe(400);
    expect(await status(A, 'POST', '/api/admin/assignments', { advisorId: aId, clientId: yId })).toBe(403);
  });
});
