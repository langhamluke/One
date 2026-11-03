import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Plus } from 'lucide-react';
import { Page } from '@/components/shell/AppShell';
import { Button, Chip, Dialog, ErrorNote, Field, Loading, PageHeader, Panel, Select, Table, TextInput, td, th, useToast } from '@/components/ui';
import { admin as adminApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { fmtDate } from '@/lib/format';
import type { InviteResponse, UserSummary } from '@shared/api';
import type { Role } from '@shared/lib/types';

export function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inv, setInv] = useState({ email: '', displayName: '', role: 'client' as Role, advisorId: '' });
  const [invRes, setInvRes] = useState<InviteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [edit, setEdit] = useState({ role: 'client' as Role, status: 'active' as UserSummary['status'], displayName: '' });
  const [assignId, setAssignId] = useState('');

  const load = useCallback(async () => {
    try { setUsers(await adminApi.users()); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const advisors = users.filter((u) => u.role === 'advisor' && u.status !== 'disabled');

  const submitInvite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await adminApi.invite({ email: inv.email.trim(), displayName: inv.displayName.trim(), role: inv.role, advisorId: inv.role === 'client' && inv.advisorId ? inv.advisorId : undefined });
      setInvRes(r);
      await load();
    } catch (err) { toast(errorMessage(err), 'danger'); } finally { setBusy(false); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); } catch { toast('Copy failed; select the link and copy it manually', 'danger'); }
  };
  const openEdit = (u: UserSummary) => { setEditing(u); setEdit({ role: u.role, status: u.status === 'disabled' ? 'disabled' : 'active', displayName: u.displayName }); setAssignId(''); };
  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await adminApi.updateUser(editing.id, { role: edit.role, status: edit.status, displayName: edit.displayName.trim() || editing.displayName });
      if (editing.role === 'client' && assignId) await adminApi.assign(editing.id, assignId);
      toast('User updated', 'ok');
      setEditing(null);
      await load();
    } catch (err) { toast(errorMessage(err), 'danger'); } finally { setBusy(false); }
  };
  const unassign = async (clientId: string, advisorId: string) => {
    try { await adminApi.unassign(clientId, advisorId); await load(); const u = users.find((x) => x.id === clientId); if (u) setEditing({ ...u, advisorIds: (u.advisorIds ?? []).filter((a) => a !== advisorId) }); } catch (err) { toast(errorMessage(err), 'danger'); }
  };
  const reset = async (u: UserSummary) => {
    try { const r = await adminApi.resetPassword(u.id); if (r.inviteUrl) { setInvRes({ inviteUrl: r.inviteUrl, expiresAt: '', userId: u.id }); setInviteOpen(true); } else toast('Reset link sent', 'ok'); } catch (err) { toast(errorMessage(err), 'danger'); }
  };
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;

  return (
    <Page>
      <PageHeader title="Users" subtitle={`${users.length} accounts`} actions={<Button variant="primary" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => { setInvRes(null); setInv({ email: '', displayName: '', role: 'client', advisorId: advisors[0]?.id ?? '' }); setInviteOpen(true); }}>Invite user</Button>} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading ? <Loading /> : (
        <Panel>
          <Table caption="Users">
            <thead><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>MFA</th><th className={th}>Assigned</th><th className={th}>Last login</th><th className={th}></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={td}>{u.displayName}</td>
                  <td className={td}>{u.email}</td>
                  <td className={td}><Chip tone={u.role === 'admin' ? 'rec' : u.role === 'advisor' ? 'edit' : 'neutral'}>{u.role}</Chip></td>
                  <td className={td}><Chip tone={u.status === 'active' ? 'ok' : u.status === 'invited' ? 'warn' : 'danger'}>{u.status}</Chip></td>
                  <td className={td}>{u.mfaEnabled ? <Chip tone="ok">on</Chip> : <span className="text-ink-3 text-xs">off</span>}</td>
                  <td className={td}><span className="text-xs">{u.role === 'client' ? (u.advisorIds ?? []).map(nameOf).join(', ') || '—' : u.role === 'advisor' ? `${(u.clientIds ?? []).length} clients` : '—'}</span></td>
                  <td className={td}>{fmtDate(u.lastLoginAt)}</td>
                  <td className={td}><div className="flex gap-1"><Button size="sm" onClick={() => openEdit(u)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => reset(u)}>Reset password</Button></div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title={invRes ? 'Invite link' : 'Invite user'} footer={invRes ? <Button variant="primary" onClick={() => setInviteOpen(false)}>Done</Button> : <><Button onClick={() => setInviteOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} form="invite-form" type="submit">Create invite</Button></>}>
        {invRes ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-2">Send this link to the user. It can be used once{invRes.expiresAt ? ` and expires ${fmtDate(invRes.expiresAt)}` : ''}.</p>
            <div className="flex gap-2">
              <TextInput readOnly value={invRes.inviteUrl} aria-label="Invite URL" className="num text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button icon={<Copy className="h-3.5 w-3.5" aria-hidden />} onClick={() => copy(invRes.inviteUrl)}>Copy</Button>
            </div>
          </div>
        ) : (
          <form id="invite-form" onSubmit={submitInvite} className="flex flex-col gap-3">
            <Field label="Email" htmlFor="inv-email"><TextInput id="inv-email" type="email" required value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
            <Field label="Display name" htmlFor="inv-name"><TextInput id="inv-name" value={inv.displayName} onChange={(e) => setInv({ ...inv, displayName: e.target.value })} /></Field>
            <Field label="Role" htmlFor="inv-role"><Select id="inv-role" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })} options={[{ value: 'client', label: 'Client' }, { value: 'advisor', label: 'Advisor' }, { value: 'admin', label: 'Admin' }]} /></Field>
            {inv.role === 'client' && <Field label="Assign advisor" htmlFor="inv-adv"><Select id="inv-adv" value={inv.advisorId} onChange={(e) => setInv({ ...inv, advisorId: e.target.value })} options={[{ value: '', label: 'Unassigned' }, ...advisors.map((a) => ({ value: a.id, label: a.displayName }))]} /></Field>}
          </form>
        )}
      </Dialog>

      <Dialog open={editing != null} onClose={() => setEditing(null)} title={`Edit ${editing?.displayName ?? ''}`} footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={saveEdit}>Save</Button></>}>
        {editing && (
          <div className="flex flex-col gap-3">
            <Field label="Display name" htmlFor="ed-name"><TextInput id="ed-name" value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} /></Field>
            <Field label="Role" htmlFor="ed-role"><Select id="ed-role" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })} options={[{ value: 'client', label: 'Client' }, { value: 'advisor', label: 'Advisor' }, { value: 'admin', label: 'Admin' }]} /></Field>
            <Field label="Status" htmlFor="ed-status"><Select id="ed-status" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as UserSummary['status'] })} options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }]} /></Field>
            {editing.role === 'client' && (
              <div>
                <div className="text-xs font-medium text-ink-2 mb-1">Advisors</div>
                <ul className="flex flex-wrap gap-1 mb-2">
                  {(editing.advisorIds ?? []).length === 0 && <li className="text-xs text-ink-3">None assigned</li>}
                  {(editing.advisorIds ?? []).map((a) => <li key={a}><Chip tone="edit">{nameOf(a)} <button type="button" className="ml-1 underline" onClick={() => unassign(editing.id, a)} aria-label={`Unassign ${nameOf(a)}`}>remove</button></Chip></li>)}
                </ul>
                <Field label="Assign advisor" htmlFor="ed-assign"><Select id="ed-assign" value={assignId} onChange={(e) => setAssignId(e.target.value)} options={[{ value: '', label: 'No change' }, ...advisors.filter((a) => !(editing.advisorIds ?? []).includes(a.id)).map((a) => ({ value: a.id, label: a.displayName }))]} /></Field>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </Page>
  );
}
