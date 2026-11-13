import { useEffect, useState } from 'react';
import { StaffLayout } from '../StaffLayout';
import { Busy, FormError } from '../../components/Field';
import { api, ApiError } from '../../lib/api';
import { AdminNote } from './Users';

type Row = { count: number | null };
interface S {
  threshold: number; total: number | null; avgFirstResponseDays: number | null; openUnread: number | null;
  byCategory: (Row & { name: string })[]; byStatus: (Row & { status: string })[]; byMode: (Row & { mode: string })[]; byMonth: (Row & { month: string })[];
}
const STATUS: Record<string, string> = { RECEIVED: 'Received', UNDER_REVIEW: 'Under review', INQUIRY: 'Inquiry', PENDING_CLOSURE: 'Closure pending', CLOSED: 'Closed' };
const MODE: Record<string, string> = { ANONYMOUS: 'Anonymous', CONFIDENTIAL: 'Confidential', NAMED: 'Named' };
const month = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** Horizontal bars with the exact number written next to each (never colour or length alone). */
function Bars({ title, rows, threshold }: { title: string; rows: { label: string; count: number | null }[]; threshold: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count ?? 0));
  return (
    <section className="card flex flex-col gap-3" aria-label={title}>
      <h2 className="font-bold">{title}</h2>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(8rem,13rem)_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            {r.count === null ? <span className="badge badge-rev justify-self-start">Hidden: fewer than {threshold}</span>
              : <span className="h-3 rounded-full bg-primary" style={{ width: `${Math.max(2, (r.count / max) * 100)}%`, opacity: r.count ? 1 : 0.25 }} aria-hidden="true" />}
            <b className="text-end">{r.count === null ? `<${threshold}` : r.count}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Statistics: counts only, and any number from 1 to 4 is hidden so nobody in a small group can be singled out.
export default function Stats() {
  const [s, setS] = useState<S | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<S>('/admin/stats').then(setS).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load statistics.')); }, []);
  const n = (v: number | null) => (v === null ? `<${s?.threshold}` : v);
  return (
    <StaffLayout>
      <div className="flex flex-col gap-6">
        <div><h1 className="text-[1.75rem] font-extrabold">Statistics</h1><p className="text-muted">Counts only. Any number below {s?.threshold ?? 5} is hidden so that nobody can be identified from a small group.</p></div>
        <AdminNote />
        <FormError message={error} />
        {!s ? <p><Busy label="Loading…" /></p> : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card"><span className="text-sm text-muted">Reports in total</span><span className="block text-3xl font-extrabold">{n(s.total)}</span></div>
              <div className="card"><span className="text-sm text-muted">Average time to first reading</span><span className="block text-3xl font-extrabold">{s.avgFirstResponseDays === null ? '—' : `${s.avgFirstResponseDays} days`}</span><span className="text-xs text-muted">Target: 2 working days{ s.avgFirstResponseDays === null ? ' · shown from 5 reports' : ''}</span></div>
              <div className="card"><span className="text-sm text-muted">Not opened yet</span><span className="block text-3xl font-extrabold">{n(s.openUnread)}</span></div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Bars title="By type of concern" threshold={s.threshold} rows={s.byCategory.map((r) => ({ label: r.name, count: r.count }))} />
              <Bars title="By month (last 6)" threshold={s.threshold} rows={s.byMonth.map((r) => ({ label: month(r.month), count: r.count }))} />
              <Bars title="By status" threshold={s.threshold} rows={s.byStatus.map((r) => ({ label: STATUS[r.status] ?? r.status, count: r.count }))} />
              <Bars title="How reporters chose to be known" threshold={s.threshold} rows={s.byMode.map((r) => ({ label: MODE[r.mode] ?? r.mode, count: r.count }))} />
            </div>
          </>
        )}
      </div>
    </StaffLayout>
  );
}
