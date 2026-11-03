import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlanStore } from '@/state/plan';
import { Button, Dialog, Field, TextArea, TextInput, useToast } from '@/components/ui';
import { errorMessage } from '@/api/client';
import { fmtDateTime } from '@/lib/format';

export function DraftBanner({ clientMode }: { clientMode: boolean }) {
  const { mode, proposal, saving, dirty, savedAt, saveError, submit, discard, saveDirect } = usePlanStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const status = saveError ? `Save failed: ${saveError}` : saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${fmtDateTime(savedAt)}` : '';

  if (mode === 'draft') {
    const doSubmit = async () => {
      setBusy(true);
      try {
        await submit(title.trim() || proposal?.title || 'Plan update', note.trim());
        setOpen(false);
        toast('Submitted for review', 'ok');
        navigate('/proposals');
      } catch (e) {
        toast(errorMessage(e), 'danger');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div data-draft-banner className="bg-rec text-white text-xs">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
          <span className="font-medium">Draft — changes are provisional until approved</span>
          <span className="opacity-80 num" aria-live="polite">{status}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setTitle(proposal?.title && proposal.title !== 'Draft' ? proposal.title : ''); setNote(proposal?.note ?? ''); setOpen(true); }}>Submit for review</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setConfirmDiscard(true)}>Discard</Button>
          </div>
        </div>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Submit for review"
          footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={doSubmit}>Submit</Button></>}
        >
          <div className="flex flex-col gap-3">
            <Field label="Title" htmlFor="submit-title"><TextInput id="submit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Raise 401(k) deferral to 10%" /></Field>
            <Field label="Note to your advisor" htmlFor="submit-note"><TextArea id="submit-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" /></Field>
            <p className="text-xxs text-ink-3">Your advisor reviews the changes against the approved plan. Nothing changes in the approved plan until they approve.</p>
          </div>
        </Dialog>
        <Dialog
          open={confirmDiscard}
          onClose={() => setConfirmDiscard(false)}
          title="Discard draft?"
          footer={<><Button onClick={() => setConfirmDiscard(false)}>Keep draft</Button><Button variant="danger" onClick={async () => { await discard(); setConfirmDiscard(false); toast('Draft discarded'); }}>Discard</Button></>}
        >
          <p className="text-sm text-ink-2">This deletes the draft and returns to the approved plan. This cannot be undone.</p>
        </Dialog>
      </div>
    );
  }

  if (mode === 'direct' && !clientMode) {
    const doSave = async () => {
      setBusy(true);
      try {
        await saveDirect(reason.trim() || undefined);
        toast('Plan saved as a new version', 'ok');
        setReason('');
      } catch (e) {
        toast(errorMessage(e), 'danger');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div data-draft-banner className="bg-paper-3 border-b border-line text-xs">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
          <span className="font-medium text-ink-2">Editing the approved plan directly</span>
          <span className="text-ink-3 num" aria-live="polite">{status}</span>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="save-reason" className="sr-only">Reason for change</label>
            <TextInput id="save-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="!min-h-[28px] !py-0.5 w-44 text-xs" />
            <Button size="sm" variant="primary" loading={busy} disabled={!dirty} onClick={doSave}>Save</Button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
