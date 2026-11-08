import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { auth } from '@/api/endpoints';
import { MOCK_MODE, errorMessage } from '@/api/client';
import { useSession } from '@/state/session';
import { Button, ErrorNote, Field, TextInput } from '@/components/ui';

function AuthFrame({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-5">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="7" fill="#1A1A1A" /><path d="M8 22 L13 14 L18 18 L24 9" fill="none" stroke="#174D38" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="24" cy="9" r="2.5" fill="#F2F2F2" /></svg>
          <span className="font-semibold text-base tracking-tight">Base Case</span>
        </div>
        <div className="card p-5">
          <h1 className="mb-4">{title}</h1>
          {children}
        </div>
        <div className="mt-3 text-xs text-ink-3 flex flex-wrap gap-3">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          {footer}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { refresh, me } = useSession();
  const next = sp.get('next') || '/';

  useEffect(() => {
    if (me && !me.mfaPending) navigate(next, { replace: true });
  }, [me, navigate, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await auth.login({ email: email.trim(), password });
      await refresh();
      navigate(res.mfaRequired ? '/mfa' : next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Email" htmlFor="login-email"><TextInput id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password" htmlFor="login-password"><TextInput id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" loading={busy} className="w-full mt-1">Sign in</Button>
        <p className="text-xxs text-ink-3">Access is by invitation. Ask your advisor or administrator for an invite link.</p>
        {MOCK_MODE && (
          <p className="text-xxs text-warn">Mock mode: sign in as admin@demo.basecase.local, advisor@demo.basecase.local or client@demo.basecase.local with any password.</p>
        )}
      </form>
    </AuthFrame>
  );
}

export function InvitePage() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<{ email: string; displayName?: string; role: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useSession();

  useEffect(() => {
    let cancel = false;
    auth.inviteInfo(token)
      .then((i) => { if (!cancel) { setInfo(i); setName(i.displayName ?? ''); } })
      .catch((e) => { if (!cancel) setError(errorMessage(e)); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 12) { setError('Use at least 12 characters'); return; }
    setBusy(true);
    setError(null);
    try {
      await auth.acceptInvite({ token, password, displayName: name.trim() });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Set up your account">
      {loading ? <p className="text-sm text-ink-3">Checking your invite…</p> : !info ? <ErrorNote>{error ?? 'This invite is not valid.'}</ErrorNote> : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <p className="text-sm text-ink-2">Invite for <span className="font-medium">{info.email}</span> ({info.role}).</p>
          <Field label="Your name" htmlFor="inv-name" hint="A first name or nickname is enough."><TextInput id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>
          <Field label="Password" htmlFor="inv-pass" hint="At least 12 characters."><TextInput id="inv-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <Field label="Confirm password" htmlFor="inv-pass2"><TextInput id="inv-pass2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" variant="primary" loading={busy} className="w-full mt-1">Create account</Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function MfaPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh, logout } = useSession();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.mfaVerify(code.trim());
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Two-factor code" footer={<button type="button" className="text-edit" onClick={async () => { await logout(); navigate('/login'); }}>Sign out</button>}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="6-digit code from your authenticator app" htmlFor="mfa-code">
          <TextInput id="mfa-code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num text-lg tracking-[0.3em] text-center" autoFocus />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6} className="w-full">Verify</Button>
      </form>
    </AuthFrame>
  );
}
