import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import QRCode from 'qrcode';
import { StaffLayout } from './StaffLayout';
import { useStaff, type StaffMe } from './StaffAuth';
import { Icon } from '../components/Icon';
import { Busy, FormError, PasswordField, TextField } from '../components/Field';
import { api, ApiError } from '../lib/api';

type Step = 'password' | 'code' | 'setup' | 'recovery';
const msg = (e: unknown) => (e instanceof ApiError && !e.message.startsWith('errors.') ? e.message : 'Something went wrong. Please try again.');

// Sign-in for committee and admin: password, then authenticator code. First time: set up the authenticator.
export default function StaffLogin() {
  const { status, me, complete, signedOutIdle } = useStaff();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [pendingMe, setPendingMe] = useState<StaffMe | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setError(''); }, [step]);
  if (status === 'in' && me && step !== 'recovery') return <Navigate to={me.role === 'ADMIN' ? '/admin' : '/staff'} replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Please enter your email and password.');
    run(async () => {
      const r = await api<{ next: 'mfa' | 'setup'; token: string }>('/staff/login', { body: { email: email.trim(), password } });
      setToken(r.token);
      if (r.next === 'mfa') { setStep('code'); return; }
      const s = await api<{ otpauth: string; secret: string }>('/staff/mfa/setup', { body: { token: r.token } });
      setQr(await QRCode.toDataURL(s.otpauth, { margin: 1, width: 220, errorCorrectionLevel: 'M' }));
      setSecret(s.secret);
      setStep('setup');
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const body = useRecovery ? { token, recoveryCode: code.trim() } : { token, code: code.replace(/\s/g, '') };
      const r = await api<{ me: StaffMe }>('/staff/mfa/verify', { body });
      await complete(r.me, password);
      setPassword('');
    });
  };

  const confirmSetup = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api<{ me: StaffMe; recoveryCodes: string[] }>('/staff/mfa/confirm', { body: { token, code: code.replace(/\s/g, '') } });
      setCodes(r.recoveryCodes);
      setPendingMe(r.me);
      setStep('recovery');
    });
  };

  const finishSetup = () => run(async () => {
    if (!pendingMe) return;
    await complete(pendingMe, password);
    setPassword('');
    nav(pendingMe.role === 'ADMIN' ? '/admin' : '/staff', { replace: true });
  });

  const download = () => {
    const blob = new Blob([`SpeakSafe recovery codes for ${email}\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'speaksafe-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const codeInput = (
    <div className="field">
      <label htmlFor="otp" className="label">{useRecovery ? 'Recovery code' : '6-digit code'}</label>
      <input id="otp" className="input !min-h-14 text-center font-mono text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value)}
        inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={useRecovery ? 11 : 7} placeholder={useRecovery ? 'xxxxx-xxxxx' : '••••••'} autoFocus />
    </div>
  );

  return (
    <StaffLayout>
      <div className="grid min-h-[70vh] items-center gap-10 lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden rounded-[28px] bg-primary p-10 text-on-primary lg:flex lg:min-h-[32rem] lg:flex-col lg:justify-between">
          <svg aria-hidden="true" className="pointer-events-none absolute -end-20 -bottom-20" width="320" height="320" viewBox="0 0 300 300">
            <circle cx="160" cy="140" r="120" fill="rgba(255,255,255,.08)" /><circle cx="160" cy="140" r="80" fill="rgba(255,255,255,.1)" />
          </svg>
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Icon name="shield" size={26} /></span>
          <div className="relative flex flex-col gap-4">
            <h2 className="text-3xl leading-tight font-extrabold">Committee and admin access</h2>
            <p className="max-w-md text-on-primary-muted">Reports are decrypted only on your own computer. Every case you open is recorded in the tamper-evident audit log.</p>
            <ul className="flex flex-col gap-3">
              <li className="flex items-center gap-3"><Icon name="key" size={20} />Password plus authenticator code, every time</li>
              <li className="flex items-center gap-3"><Icon name="lock" size={20} />Your private key never leaves this browser unencrypted</li>
              <li className="flex items-center gap-3"><Icon name="clock" size={20} />Signed out after 15 minutes without activity</li>
            </ul>
          </div>
          <Link to="/" className="relative text-sm text-on-primary underline">Not a committee member? Go to the public site</Link>
        </aside>

        <div className="mx-auto w-full max-w-md">
          {signedOutIdle && step === 'password' && (
            <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl bg-primary-soft p-3.5"><Icon name="clock" size={20} />You were signed out after 15 minutes without activity.</div>
          )}
          <div className="mb-5 flex items-center gap-2 text-sm">
            <span className={`badge ${step === 'password' ? 'badge-rec' : 'badge-clo'}`}>{step === 'password' ? '1 · Password' : <><Icon name="check" size={13} />Password</>}</span>
            <span className="text-muted">→</span>
            <span className={`badge ${step === 'password' ? '' : step === 'recovery' ? 'badge-clo' : 'badge-rec'} ${step === 'password' ? 'bg-surface-2 text-muted' : ''}`}>2 · Authenticator</span>
          </div>

          {step === 'password' && (
            <form onSubmit={submitPassword} noValidate className="card flex flex-col gap-5 !p-7">
              <h1 className="text-2xl font-extrabold">Sign in</h1>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <FormError message={error} />
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Busy label="Checking…" /> : 'Continue'}</button>
              <p className="text-sm text-muted">Too many wrong tries slow sign-in down for a while. Accounts are never locked for good.</p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={submitCode} noValidate className="card flex flex-col gap-5 !p-7">
              <h1 className="text-2xl font-extrabold">{useRecovery ? 'Use a recovery code' : 'Enter your 6-digit code'}</h1>
              <p className="text-muted">{useRecovery ? 'Each recovery code works only once.' : 'Open Google Authenticator, Microsoft Authenticator or Authy and type the code shown for SpeakSafe.'}</p>
              {codeInput}
              <FormError message={error} />
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Busy label="Unlocking your keys…" /> : 'Verify and sign in'}</button>
              <button type="button" className="self-start text-sm text-primary underline" onClick={() => { setUseRecovery((u) => !u); setCode(''); }}>
                {useRecovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
              </button>
            </form>
          )}

          {step === 'setup' && (
            <form onSubmit={confirmSetup} noValidate className="card flex flex-col gap-5 !p-7">
              <h1 className="text-2xl font-extrabold">Set up two-step sign-in</h1>
              <p className="text-muted">This is needed once. After this, you'll sign in with your password and a code from your phone.</p>
              <ol className="flex flex-col gap-4">
                <li className="flex flex-col gap-3">
                  <span><b>1.</b> Install Google Authenticator, Microsoft Authenticator or Authy on your phone.</span>
                </li>
                <li className="flex flex-col gap-3">
                  <span><b>2.</b> In the app, choose <i>Add account → Scan a QR code</i>, and scan this:</span>
                  {qr && <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="self-center rounded-xl border border-line bg-white p-2" />}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-primary">Can't scan? Type this key instead</summary>
                    <code className="mt-2 block break-all rounded-lg bg-surface-2 p-2 font-mono">{secret.match(/.{1,4}/g)?.join(' ')}</code>
                  </details>
                </li>
                <li><b>3.</b> Type the 6-digit code the app shows.</li>
              </ol>
              {codeInput}
              <FormError message={error} />
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Busy label="Checking…" /> : 'Turn on two-step sign-in'}</button>
            </form>
          )}

          {step === 'recovery' && (
            <div className="card flex flex-col gap-5 !p-7">
              <h1 className="text-2xl font-extrabold">Save your recovery codes</h1>
              <p className="text-muted">If you lose your phone, each of these codes lets you sign in once. They are shown only now.</p>
              <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 font-mono text-[.95rem]">
                {codes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-quiet btn-sm" onClick={download}><Icon name="upload" size={16} />Download as a file</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}><Icon name="copy" size={16} />Copy</button>
              </div>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                <span>I have saved my recovery codes somewhere safe.</span>
              </label>
              {pendingMe?.needsKeys && <p className="card-soft text-sm">Next, your personal encryption keys are created on this computer. This takes a few seconds.</p>}
              <FormError message={error} />
              <button type="button" className="btn btn-primary w-full" disabled={!saved || busy} onClick={finishSetup}>{busy ? <Busy label="Creating your keys…" /> : 'Continue to my cases'}</button>
            </div>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}
