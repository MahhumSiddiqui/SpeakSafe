import { useEffect, useState } from 'react';
import { StaffLayout } from '../StaffLayout';
import { Icon } from '../../components/Icon';
import { Busy, FormError } from '../../components/Field';
import { api, ApiError } from '../../lib/api';
import { AdminNote } from './Users';

interface Row { id: string; at: string; actorType: string; actor: string; action: string; targetType: string | null; targetId: string | null; hash: string; prevHash: string }
interface Verify { ok: boolean; checked: number; brokenAtId?: string; reason?: string; at: string }
const msg = (e: unknown) => (e instanceof ApiError && !e.message.startsWith('errors.') ? e.message : 'Something went wrong. Please try again.');
const nice = (a: string) => a.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Tamper-evident audit log: every row stores the hash of the row before it. "Verify integrity" recomputes the chain.
export default function Audit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [more, setMore] = useState(true);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (before?: string) => {
    const q = new URLSearchParams({ ...(action ? { action } : {}), ...(actor ? { actor } : {}), ...(before ? { before } : {}) });
    const r = await api<{ rows: Row[]; actions: string[] }>(`/admin/audit?${q}`);
    setActions(r.actions);
    setRows((old) => (before ? [...old, ...r.rows] : r.rows));
    setMore(r.rows.length === 50);
  };
  useEffect(() => { load().catch((e) => setError(msg(e))); }, [action, actor]); // eslint-disable-line react-hooks/exhaustive-deps

  const runVerify = async () => {
    setBusy(true); setError('');
    try { setVerify(await api<Verify>('/admin/audit/verify', { method: 'POST' })); await load(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <StaffLayout>
      <div className="flex flex-col gap-6">
        <div><h1 className="text-[1.75rem] font-extrabold">Audit log</h1><p className="text-muted">Every important action, in order. Entries can be read and checked, never changed or deleted.</p></div>
        <AdminNote />
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card flex flex-col gap-3 !border-2 !border-primary">
            <div className="flex items-center gap-3"><span className="icon-tile"><Icon name="shield" /></span><h2 className="text-lg font-bold">Check the log has not been changed</h2></div>
            <p className="text-sm text-muted">Each entry is linked to the one before it by a SHA-256 hash. If anyone edits or removes an entry, this check fails and shows where.</p>
            <button type="button" className="btn btn-primary self-start" onClick={runVerify} disabled={busy}>{busy ? <Busy label="Checking every entry…" /> : 'Verify integrity'}</button>
            {verify && (verify.ok
              ? <p role="status" className="badge badge-clo !text-sm self-start"><Icon name="check" size={14} />Log intact · {verify.checked} entries checked · {new Date(verify.at).toLocaleString('en-US')}</p>
              : <p role="alert" className="rounded-xl border-2 border-accent bg-accent-soft p-3 font-semibold">Tampering detected at entry #{verify.brokenAtId} ({verify.reason}). Entries before it are intact.</p>)}
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg font-bold">Filter</h2>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">Event
                <select className="input !min-h-11 !w-56" value={action} onChange={(e) => setAction(e.target.value)}>
                  <option value="">All events</option>{actions.map((a) => <option key={a} value={a}>{nice(a)}</option>)}
                </select></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Who
                <select className="input !min-h-11 !w-44" value={actor} onChange={(e) => setActor(e.target.value)}>
                  <option value="">Everyone</option><option value="REPORTER">Reporters</option><option value="HANDLER">Committee</option><option value="ADMIN">Admins</option><option value="SYSTEM">System</option>
                </select></label>
            </div>
            <p className="text-xs text-muted">Reporter actions are recorded without any account or name, so the log can never link a person to a report.</p>
          </section>
        </div>
        <FormError message={error} />
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead><tr className="border-b border-line text-xs tracking-wide text-muted uppercase">{['#', 'Time', 'Who', 'Event', 'Case', 'Hash (links to previous)'].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${verify && !verify.ok && verify.brokenAtId === r.id ? 'bg-accent-soft' : ''}`}>
                  <td className="px-4 py-2.5 font-mono">{r.id}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="px-4 py-2.5">{r.actor}</td>
                  <td className="px-4 py-2.5">{nice(r.action)}</td>
                  <td className="px-4 py-2.5 font-mono">{r.targetId ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-muted">{r.hash}… ← {r.prevHash}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {more && rows.length > 0 && <button type="button" className="btn btn-quiet self-center" onClick={() => load(rows[rows.length - 1].id)}>Load older entries</button>}
      </div>
    </StaffLayout>
  );
}
