import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { StaffLayout } from './StaffLayout';
import { useStaff } from './StaffAuth';
import { Icon } from '../components/Icon';
import { Busy, FormError, PasswordField } from '../components/Field';
import { StrengthMeter } from '../pages/Signup';
import { api, ApiError } from '../lib/api';
import { deriveKeys, seal, sodium, toB64 } from '../lib/keys';
import { passwordStrength } from '../lib/words';

// My account: change password. A member's private key is re-locked with the new password here, in the browser.
export default function Account() {
  const { me, keys, setMe } = useStaff();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = !!me?.mustChangePassword;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 12) return setError('Please use at least 12 characters.');
    if (passwordStrength(next) < 2) return setError('This password is easy to guess. Try three or more random words.');
    if (next !== confirm) return setError('The two new passwords are not the same.');
    if (me?.publicKey && !keys) return setError('Your encryption key is locked. Please sign out and sign in again first.');
    setBusy(true);
    try {
      let rewrap = {};
      if (me?.publicKey && keys) {
        const s = await sodium();
        const keySalt = toB64(s, s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
        const { wrapKey } = await deriveKeys(next, keySalt);
        rewrap = { keySalt, encryptedPrivateKey: await seal(wrapKey, keys.privateKey) };
      }
      await api('/staff/password', { body: { currentPassword: current, newPassword: next, ...rewrap } });
      setCurrent(''); setNext(''); setConfirm('');
      setDone(true);
      if (me) setMe({ ...me, mustChangePassword: false });
      if (first && me) nav(me.role === 'ADMIN' ? '/admin' : '/staff', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && !err.message.startsWith('errors.') ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StaffLayout>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form onSubmit={submit} noValidate className="card flex flex-col gap-5 !p-7">
          <h1 className="text-2xl font-extrabold">{first ? 'Choose your own password' : 'Change password'}</h1>
          {first && <div role="status" className="rounded-2xl bg-primary-soft p-3.5">You signed in with a one-time password from the administrator. Please choose your own before continuing.</div>}
          {done && !first && <div role="status" className="flex items-center gap-2 rounded-2xl bg-primary-soft p-3.5"><Icon name="check" size={18} />Password changed. You were signed out on other devices.</div>}
          <PasswordField label={first ? 'One-time password' : 'Current password'} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <div className="flex flex-col gap-2">
            <PasswordField label="New password" hint="At least 12 characters. Three or more random words work well." value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <StrengthMeter value={next} />
          </div>
          <PasswordField label="Type the new password again" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          <FormError message={error} />
          <button className="btn btn-primary" disabled={busy}>{busy ? <Busy label={me?.publicKey ? 'Re-locking your key…' : 'Saving…'} /> : 'Save new password'}</button>
        </form>
        <aside className="flex flex-col gap-4">
          <section className="card-soft flex flex-col gap-2">
            <h2 className="font-bold">{me?.displayName}</h2>
            <p className="text-sm text-muted">{me?.email} · {me?.role === 'ADMIN' ? 'Administrator' : 'Committee member'}</p>
          </section>
          {me?.publicKey && (
            <section className="card flex gap-3 text-[.95rem]">
              <span className="icon-tile sm"><Icon name="key" size={18} /></span>
              <span>Your password also protects your <b>encryption key</b>. Changing it here re-locks the key on this computer. The administrator can't reset it for you, so please remember it.</span>
            </section>
          )}
          <section className="card flex gap-3 text-[.95rem]">
            <span className="icon-tile sm"><Icon name="lock" size={18} /></span>
            <span>Recovery codes left: <b>{me?.recoveryCodesLeft}</b>. If you run low, ask the administrator to reset your two-step sign-in.</span>
          </section>
        </aside>
      </div>
    </StaffLayout>
  );
}
