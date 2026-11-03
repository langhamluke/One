import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Page } from '@/components/shell/AppShell';
import { Button, Chip, EmptyState, ErrorNote, Loading, PageHeader, Select, TextArea, cx, useToast } from '@/components/ui';
import { chat, clients as clientsApi, proposals as proposalsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useSession, isStaff } from '@/state/session';
import { fmtDateTime } from '@/lib/format';
import type { ChatThread, ChatThreadSummary, ClientListItem, ProposalSummary } from '@shared/api';

export function AssistantPage() {
  const { me } = useSession();
  const staff = isStaff(me?.user.role);
  const toast = useToast();
  const [clientList, setClientList] = useState<ClientListItem[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [active, setActive] = useState<ChatThread | null>(null);
  const [drafts, setDrafts] = useState<ProposalSummary[]>([]);
  const [useDraft, setUseDraft] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const mode = me?.firm.assistantMode ?? 'offline';

  useEffect(() => {
    if (!staff) return;
    clientsApi.list().then((l) => { setClientList(l); if (l[0] && !clientId) setClientId(l[0].id); }).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff]);

  const loadThreads = useCallback(async () => {
    if (staff && !clientId) return;
    setLoading(true);
    try {
      const [t, d] = await Promise.all([chat.threads(staff ? clientId : undefined), proposalsApi.list({ clientId: staff ? clientId : undefined, status: 'draft' }).catch(() => [])]);
      setThreads(t);
      setDrafts(d);
      if (t[0]) setActive(await chat.get(t[0].id));
      else setActive(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [staff, clientId]);
  useEffect(() => { void loadThreads(); }, [loadThreads]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [active?.messages.length]);

  const open = async (id: string) => {
    try { setActive(await chat.get(id)); } catch (e) { toast(errorMessage(e), 'danger'); }
  };
  const newThread = async () => {
    try {
      const t = await chat.create({ clientId: staff ? clientId : undefined });
      setThreads((xs) => [t, ...xs]);
      setActive(t);
    } catch (e) { toast(errorMessage(e), 'danger'); }
  };
  const remove = async (id: string) => {
    try {
      await chat.remove(id);
      setThreads((xs) => xs.filter((t) => t.id !== id));
      if (active?.id === id) setActive(null);
    } catch (e) { toast(errorMessage(e), 'danger'); }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    try {
      let t = active;
      if (!t) {
        t = await chat.create({ clientId: staff ? clientId : undefined });
        setThreads((xs) => [t!, ...xs]);
      }
      const res = await chat.send(t.id, { content, proposalId: useDraft || undefined });
      const updated: ChatThread = { ...t, messages: [...t.messages, res.message, res.reply], messageCount: t.messageCount + 2, updatedAt: res.reply.createdAt };
      setActive(updated);
      setThreads((xs) => xs.map((x) => (x.id === t!.id ? { ...x, messageCount: updated.messageCount, updatedAt: updated.updatedAt, title: x.title === 'New conversation' ? content.slice(0, 48) : x.title } : x)));
      setText('');
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Assistant"
        subtitle={<span className="inline-flex items-center gap-2">Explains the plan; never changes it. <Chip tone={mode === 'claude' ? 'rec' : 'neutral'}>{mode === 'claude' ? 'Claude' : 'Offline explainer'}</Chip></span>}
        actions={staff && clientList.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="asst-client" className="text-xs text-ink-3">Client</label>
            <Select id="asst-client" value={clientId} onChange={(e) => setClientId(e.target.value)} options={clientList.map((c) => ({ value: c.id, label: c.displayName }))} className="!w-56" />
          </div>
        ) : undefined}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="grid gap-4 lg:grid-cols-12">
        <aside className="lg:col-span-3 card p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={newThread} className="w-full">New conversation</Button>
          {loading ? <Loading /> : threads.length === 0 ? <p className="text-xs text-ink-3 p-2">No conversations yet.</p> : (
            <ul className="flex flex-col gap-0.5">
              {threads.map((t) => (
                <li key={t.id} className={cx('group flex items-center gap-1 rounded-md', active?.id === t.id ? 'bg-paper-3' : 'hover:bg-paper-3')}>
                  <button type="button" onClick={() => open(t.id)} aria-current={active?.id === t.id ? 'true' : undefined} className="flex-1 min-w-0 text-left px-2 py-1.5 focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none rounded-md">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-xxs text-ink-3">{t.messageCount} messages · {fmtDateTime(t.updatedAt)}</div>
                  </button>
                  <button type="button" aria-label={`Delete ${t.title}`} onClick={() => remove(t.id)} className="p-1.5 text-ink-4 hover:text-danger rounded focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="lg:col-span-9 card flex flex-col min-h-[60vh] max-h-[75vh]" aria-label="Conversation">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" role="log" aria-live="polite">
            {!active || active.messages.length === 0 ? (
              <EmptyState title="Ask about your plan" detail="Try: Why is my emergency fund target six months? What does the tiered standard plan mean for me?" />
            ) : active.messages.map((m) => (
              <div key={m.id} className={cx('max-w-[85%] rounded-card px-3 py-2 text-sm', m.role === 'user' ? 'self-end bg-edit-soft' : 'self-start bg-paper-3')}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                <div className="text-xxs text-ink-3 mt-1 flex items-center gap-2">{fmtDateTime(m.createdAt)}{m.role === 'assistant' && <Chip tone="neutral">{m.mode === 'claude' ? 'Claude' : 'Offline'}</Chip>}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="border-t border-line-2 p-3 flex flex-col gap-2">
            {drafts.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="asst-draft" className="text-xs text-ink-3">Context</label>
                <Select id="asst-draft" value={useDraft} onChange={(e) => setUseDraft(e.target.value)} options={[{ value: '', label: 'Approved plan' }, ...drafts.map((d) => ({ value: d.id, label: `Draft: ${d.title}` }))]} className="!w-64" />
              </div>
            )}
            <div className="flex gap-2 items-end">
              <label htmlFor="asst-input" className="sr-only">Message</label>
              <TextArea id="asst-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question about the plan" className="!min-h-[44px] flex-1" rows={2} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e as unknown as FormEvent); } }} />
              <Button type="submit" variant="primary" loading={busy} icon={<Send className="h-3.5 w-3.5" aria-hidden />}>Send</Button>
            </div>
            <p className="text-xxs text-ink-3">The assistant explains numbers produced by the plan engine. It is not financial, tax or legal advice and never edits your plan.</p>
          </form>
        </section>
      </div>
    </Page>
  );
}
