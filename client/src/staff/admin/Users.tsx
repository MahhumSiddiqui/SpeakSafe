import { useEffect, useRef, useState, type FormEvent } from 'react';
import { StaffLayout } from '../StaffLayout';
import { Icon } from '../../components/Icon';
import { Busy, FormError, TextField } from '../../components/Field';
import { api, ApiError } from '../../lib/api';

interface U { id: string; email: string; displayName: string; role: 'HANDLER' | 'ADMIN'; active: boolean; mfa: string; recoveryCodesLeft: number; hasKeys: boolean; lastLoginAt: string | null; mustChangePassword: boolean; openCases: number }
const msg = (e: unknown) => (e instanceof ApiError && !e.message.startsWith('errors.') ? e.message : 'Something went wrong. Please try again.');
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never');

export function AdminNote() {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
      <Icon name="lock" size={16} />Admins manage accounts and settings. Admins cannot open or read any report.
    </p>
  );
}

// Accounts: add staff, one-time passwords, two-step sign-in resets, deactivation with the two-reader rule.
export default function Users() {
  const [users, setUsers] = useState<U[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'HANDLER' as 'HANDLER' | 'ADMIN' });
  const dlg = useRef<HTMLDialogElement>(null);

  const load = () => api<U[]>('/admin/users').then(setUsers).catch((e) => setError(msg(e)));
  useEffect(() => { load(); }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await fn(); await load(); } catch (e) { setError(msg(e)); } finally { setBusy(''); }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      const r = await api<{ temporaryPassword: string }>('/admin/users', { body: form });
      setSecret({ who: `${form.displayName} (${form.email})`, password: r.temporaryPassword });
      setForm({ email: '', displayName: '', role: 'HANDLER' });
      dlg.current?.showModal();
    });
  };

  return (
    <StaffLayout>
      <div className="flex flex-col gap-6">
        <div><h1 className="text-[1.75rem] font-extrabold">Accounts</h1><p className="text-muted">Committee members and administrators.</p></div>
        <AdminNote />
        <FormError message={error} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="card overflow-x-auto !p-0">
            {!users ? <p className="p-6"><Busy label="Loading…" /></p> : (
              <table className="w-full min-w-[820px] border-collapse text-[.95rem]">
                <thead><tr className="border-b border-line text-xs tracking-wide text-muted uppercase">{['Person', 'Role', 'Two-step', 'Open cases', 'Last sign-in', 'Actions'].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={`border-b border-line last:border-0 ${u.active ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-3"><b>{u.displayName}</b><span className="block text-xs text-muted">{u.email}</span>
                        {!u.active && <span className="badge badge-inq mt-1">Deactivated</span>}{u.mustChangePassword && <span className="badge badge-rev mt-1">One-time password</span>}</td>
                      <td className="px-4 py-3">{u.role === 'ADMIN' ? 'Admin' : 'Committee'}{u.role === 'HANDLER' && <span className="block text-xs text-muted">{u.hasKeys ? 'Key created' : 'No key yet'}</span>}</td>
                      <td className="px-4 py-3">{u.mfa === 'on' ? <span className="badge badge-clo"><Icon name="check" size={13} />On · {u.recoveryCodesLeft} codes</span> : <span className="badge badge-rev">Not set up</span>}</td>
                      <td className="px-4 py-3">{u.role === 'HANDLER' ? u.openCases : '—'}</td>
                      <td className="px-4 py-3 text-muted">{date(u.lastLoginAt)}</td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          {u.mfa === 'on' && <button type="button" className="btn btn-quiet btn-sm !min-h-9" disabled={!!busy} onClick={() => run(`mfa${u.id}`, () => api(`/admin/users/${u.id}/reset-mfa`, { method: 'POST' }).then(() => {}))}>Reset two-step</button>}
                          {!u.hasKeys && <button type="button" className="btn btn-quiet btn-sm !min-h-9" disabled={!!busy} onClick={() => run(`pw${u.id}`, async () => {
                            const r = await api<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`, { method: 'POST' });
                            setSecret({ who: `${u.displayName} (${u.email})`, password: r.temporaryPassword }); dlg.current?.showModal();
                          })}>New one-time password</button>}
                          <button type="button" className="btn btn-quiet btn-sm !min-h-9" disabled={!!busy} onClick={() => run(`act${u.id}`, () => api(`/admin/users/${u.id}/active`, { body: { active: !u.active } }).then(() => {}))}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <form onSubmit={create} noValidate className="card flex flex-col gap-4">
            <h2 className="text-lg font-bold">Add a person</h2>
            <TextField label="Full name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            <TextField label="Work email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <fieldset className="flex flex-col gap-2"><legend className="mb-2 font-semibold">Role</legend>
              <div className="flex gap-2">
                <button type="button" className="pill" aria-pressed={form.role === 'HANDLER'} onClick={() => setForm({ ...form, role: 'HANDLER' })}>Committee member</button>
                <button type="button" className="pill" aria-pressed={form.role === 'ADMIN'} onClick={() => setForm({ ...form, role: 'ADMIN' })}>Admin</button>
              </div>
            </fieldset>
            <p className="text-sm text-muted">A one-time password is created. They must change it, and set up the authenticator app, at first sign-in.</p>
            <button className="btn btn-primary" disabled={busy === 'create'}>{busy === 'create' ? <Busy label="Creating…" /> : 'Create account'}</button>
          </form>
        </div>
      </div>
      <dialog ref={dlg} className="sheet" aria-labelledby="otp-h" onClose={() => setSecret(null)}>
        <div className="flex flex-col gap-4 p-6">
          <h2 id="otp-h" className="text-xl font-bold">One-time password</h2>
          <p>For <b>{secret?.who}</b>. Give it to them privately, in person if possible. It is shown only now.</p>
          <code className="rounded-xl bg-surface-2 p-4 text-center font-mono text-xl tracking-wider">{secret?.password}</code>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => secret && navigator.clipboard?.writeText(secret.password)}><Icon name="copy" size={16} />Copy</button>
            <button type="button" className="btn btn-primary" onClick={() => dlg.current?.close()}>Done</button>
          </div>
        </div>
      </dialog>
    </StaffLayout>
  );
}
