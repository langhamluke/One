import { useEffect, useState, type FormEvent } from 'react';
import { Page } from '@/components/shell/AppShell';
import { Button, ErrorNote, Field, Loading, NumberInput, PageHeader, Panel, TextArea, TextInput, Toggle, useToast } from '@/components/ui';
import { admin as adminApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useSession } from '@/state/session';
import type { SettingsRecord } from '@shared/api';

export function SettingsPage() {
  const toast = useToast();
  const { refresh } = useSession();
  const [s, setS] = useState<SettingsRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminApi.settings().then(setS).catch((e) => setError(errorMessage(e))); }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    try {
      setS(await adminApi.updateSettings(s));
      await refresh();
      toast('Settings saved', 'ok');
    } catch (err) { toast(errorMessage(err), 'danger'); } finally { setBusy(false); }
  };
  return (
    <Page>
      <PageHeader title="Settings" subtitle="Firm-wide configuration." />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!s ? <Loading /> : (
        <form onSubmit={save} className="max-w-2xl flex flex-col gap-4">
          <Panel title="Firm">
            <div className="flex flex-col gap-3">
              <Field label="Firm name" htmlFor="st-name" hint="Shown in the rail and on the printed summary."><TextInput id="st-name" value={s.firmName} onChange={(e) => setS({ ...s, firmName: e.target.value })} maxLength={80} /></Field>
              <Field label="Disclaimer" htmlFor="st-disc" hint="Printed on every summary."><TextArea id="st-disc" value={s.disclaimer} onChange={(e) => setS({ ...s, disclaimer: e.target.value })} rows={4} /></Field>
            </div>
          </Panel>
          <Panel title="Access">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invite expiry" htmlFor="st-inv"><NumberInput id="st-inv" value={s.inviteExpiryHours} min={1} max={720} step={1} suffix="hours" onChange={(v) => setS({ ...s, inviteExpiryHours: v ?? 72 })} /></Field>
              <Field label="Session length" htmlFor="st-sess"><NumberInput id="st-sess" value={s.sessionHours} min={1} max={168} step={1} suffix="hours" onChange={(v) => setS({ ...s, sessionHours: v ?? 12 })} /></Field>
              <Toggle id="st-mfa" checked={s.requireMfaForStaff} onChange={(v) => setS({ ...s, requireMfaForStaff: v })} label="Require MFA for advisors and admins" />
              <Toggle id="st-asst" checked={s.assistantEnabled} onChange={(v) => setS({ ...s, assistantEnabled: v })} label="Enable the assistant" description="Runs on Claude when an API key is configured, otherwise the offline explainer" />
            </div>
          </Panel>
          <div><Button type="submit" variant="primary" loading={busy}>Save settings</Button></div>
        </form>
      )}
    </Page>
  );
}
