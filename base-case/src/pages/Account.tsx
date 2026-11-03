import { useEffect, useState, type FormEvent } from 'react';
import { Page } from '@/components/shell/AppShell';
import { Button, Chip, Dialog, ErrorNote, Field, Loading, PageHeader, Panel, Table, TextInput, td, th, useToast } from '@/components/ui';
import { auth } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useSession } from '@/state/session';
import { fmtDateTime } from '@/lib/format';
import type { MfaSetupResponse, SessionInfo } from '@shared/api';

export function AccountPage() {
  const { me, refresh } = useSession();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  const loadSessions = () => auth.sessions().then(setSessions).catch(() => setSessions([]));
  useEffect(() => { void loadSessions(); }, []);

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    setPwErr(null);
    if (pw.next !== pw.confirm) { setPwErr('New passwords do not match'); return; }
    if (pw.next.length < 12) { setPwErr('Use at least 12 characters'); return; }
    setBusy(true);
    try { await auth.changePassword({ currentPassword: pw.current, newPassword: pw.next }); toast('Password changed', 'ok'); setPw({ current: '', next: '', confirm: '' }); } catch (err) { setPwErr(errorMessage(err)); } finally { setBusy(false); }
  };
  const startMfa = async () => { try { setSetup(await auth.mfaSetup()); setCode(''); } catch (err) { toast(errorMessage(err), 'danger'); } };
  const enableMfa = async () => {
    setBusy(true);
    try { await auth.mfaEnable(code); await refresh(); setSetup(null); toast('Two-factor authentication enabled', 'ok'); } catch (err) { toast(errorMessage(err), 'danger'); } finally { setBusy(false); }
  };
  const disableMfa = async () => {
    setBusy(true);
    try { await auth.mfaDisable(code); await refresh(); setDisableOpen(false); toast('Two-factor authentication disabled'); } catch (err) { toast(errorMessage(err), 'danger'); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { await auth.revokeSession(id); await loadSessions(); toast('Session revoked', 'ok'); } catch (err) { toast(errorMessage(err), 'danger'); } };

  return (
    <Page>
      <PageHeader title="Account" subtitle={<span>{me?.user.email} · <span className="capitalize">{me?.user.role}</span></span>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Change password">
          <form onSubmit={changePw} className="flex flex-col gap-3" noValidate>
            <Field label="Current password" htmlFor="pw-cur"><TextInput id="pw-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 12 characters."><TextInput id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <Field label="Confirm new password" htmlFor="pw-conf"><TextInput id="pw-conf" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            {pwErr && <ErrorNote>{pwErr}</ErrorNote>}
            <div><Button type="submit" variant="primary" loading={busy}>Update password</Button></div>
          </form>
        </Panel>
        <Panel title="Two-factor authentication" actions={me?.user.mfaEnabled ? <Chip tone="ok">Enabled</Chip> : <Chip tone="warn">Off</Chip>}>
          {me?.user.mfaEnabled ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-2">Your account asks for a 6-digit code from an authenticator app at every sign-in.</p>
              <div><Button variant="danger" onClick={() => { setCode(''); setDisableOpen(true); }}>Disable</Button></div>
            </div>
          ) : setup ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-2">Scan the code with an authenticator app, then enter the 6-digit code it shows.</p>
              <img src={setup.qrDataUrl} alt="QR code for the authenticator app" width={168} height={168} className="border border-line rounded-md bg-white" />
              <details className="text-xs text-ink-3"><summary className="cursor-pointer">Can't scan? Show the setup key</summary><code className="num break-all">{setup.otpauthUrl}</code></details>
              <Field label="Code" htmlFor="mfa-code"><TextInput id="mfa-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num !w-40 tracking-[0.3em]" /></Field>
              <div className="flex gap-2"><Button onClick={() => setSetup(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={enableMfa}>Enable</Button></div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-2">Add a second factor with any TOTP authenticator app.</p>
              <div><Button variant="primary" onClick={startMfa}>Set up</Button></div>
            </div>
          )}
        </Panel>
        <Panel title="Sessions" className="lg:col-span-2">
          {!sessions ? <Loading /> : sessions.length === 0 ? <p className="text-sm text-ink-3">No session data.</p> : (
            <Table caption="Active sessions">
              <thead><tr><th className={th}>Device</th><th className={th}>Started</th><th className={th}>Last seen</th><th className={th}></th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className={td}>{s.userAgent}{s.current && <Chip tone="ok" className="ml-2">This device</Chip>}</td>
                    <td className={td}>{fmtDateTime(s.createdAt)}</td>
                    <td className={td}>{fmtDateTime(s.lastSeenAt)}</td>
                    <td className={td}>{!s.current && <Button size="sm" variant="danger" onClick={() => revoke(s.id)}>Revoke</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
      <Dialog open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable two-factor authentication" footer={<><Button onClick={() => setDisableOpen(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={disableMfa}>Disable</Button></>}>
        <Field label="Enter your current 6-digit code to confirm" htmlFor="mfa-dis"><TextInput id="mfa-dis" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num !w-40 tracking-[0.3em]" /></Field>
      </Dialog>
    </Page>
  );
}
