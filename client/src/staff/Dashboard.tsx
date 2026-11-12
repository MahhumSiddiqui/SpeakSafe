import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { StaffLayout } from './StaffLayout';
import { useStaff } from './StaffAuth';
import { Icon } from '../components/Icon';
import { Busy, FormError } from '../components/Field';
import { api, ApiError } from '../lib/api';
import { STATUS_BADGE, type Status } from '../pages/cases/caseData';

interface Row { id: string; category: string; mode: string; status: Status; aboutOther: boolean; submittedAt: string; lastActionAt: string | null; waiting: boolean; needsMyApproval: boolean }
const STATUS_LABEL: Record<Status, string> = { RECEIVED: 'Received', UNDER_REVIEW: 'Under review', INQUIRY: 'Inquiry', PENDING_CLOSURE: 'Closure pending', CLOSED: 'Closed' };
const MODE: Record<string, string> = { ANONYMOUS: 'Anonymous', CONFIDENTIAL: 'Confidential', NAMED: 'Named' };
const ago = (d: string) => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
};
const date = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// The committee member's inbox: only cases sealed to them, with alerts for anything waiting.
export default function Dashboard() {
  const { me } = useStaff();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [statuses, setStatuses] = useState<Status[]>(['RECEIVED', 'UNDER_REVIEW', 'INQUIRY', 'PENDING_CLOSURE']);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<Row[]>('/staff/cases').then(setRows).catch((e) => { setError(e instanceof ApiError ? e.message : 'Could not load cases.'); setRows([]); });
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => statuses.includes(r.status) && (!onlyWaiting || r.waiting) && r.id.toLowerCase().includes(q.trim().toLowerCase())), [rows, statuses, onlyWaiting, q]);
  const count = (s: Status[]) => (rows ?? []).filter((r) => s.includes(r.status)).length;
  const waiting = (rows ?? []).filter((r) => r.waiting).length;
  const approvals = (rows ?? []).filter((r) => r.needsMyApproval).length;
  const hour = new Date().getHours();

  const stat = (icon: string, label: string, n: number, tone = '') => (
    <div className="card flex items-center gap-4">
      <span className={`icon-tile ${tone}`}><Icon name={icon} /></span>
      <span><span className="block text-sm text-muted">{label}</span><span className="text-2xl font-extrabold">{n}</span></span>
    </div>
  );

  return (
    <StaffLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-extrabold">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {me?.displayName}</h1>
            <p className="text-muted">{rows ? (() => { const n = rows.filter((r) => r.status !== 'CLOSED').length; return n === 0 ? 'You have no open cases.' : `You have ${n} open ${n === 1 ? 'case' : 'cases'}.`; })() : ' '}</p>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Search by case ID</span>
            <span className="input flex !w-72 items-center gap-2 !min-h-11"><Icon name="search" size={18} /><input className="w-full bg-transparent outline-none" placeholder="Search case ID" value={q} onChange={(e) => setQ(e.target.value)} /></span>
          </label>
        </div>

        {me?.recoveryCodesLeft !== undefined && me.recoveryCodesLeft <= 3 && (
          <div className="rounded-2xl border-2 border-accent bg-accent-soft p-3.5">You have only {me.recoveryCodesLeft} recovery codes left. Ask the administrator to reset your two-step sign-in to get new ones.</div>
        )}
        {(waiting > 0 || approvals > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border-2 border-accent bg-accent-soft p-4">
            <span className="flex items-center gap-3">
              <span className="icon-tile accent !bg-surface"><Icon name="clock" /></span>
              <span>
                {waiting > 0 && <b className="block">{waiting === 1 ? '1 case has' : `${waiting} cases have`} had no action for more than 7 days.</b>}
                {approvals > 0 && <span className="block">{approvals === 1 ? '1 closure needs' : `${approvals} closures need`} your approval.</span>}
                <span className="text-sm text-muted">Reporters see "waiting" on their timeline, so a short update helps.</span>
              </span>
            </span>
            {waiting > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => setOnlyWaiting(true)}>Show them</button>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stat('flag', 'New', count(['RECEIVED']))}
          {stat('eye', 'Under review', count(['UNDER_REVIEW']))}
          {stat('search', 'Inquiry', count(['INQUIRY']), 'accent')}
          {stat('users', 'Need my approval', approvals)}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {(['RECEIVED', 'UNDER_REVIEW', 'INQUIRY', 'PENDING_CLOSURE', 'CLOSED'] as Status[]).map((s) => (
            <button key={s} type="button" className="pill !min-h-10 text-sm" aria-pressed={statuses.includes(s)}
              onClick={() => setStatuses((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{STATUS_LABEL[s]}</button>
          ))}
          <button type="button" className="pill !min-h-10 text-sm" aria-pressed={onlyWaiting} onClick={() => setOnlyWaiting((w) => !w)}>Waiting too long</button>
        </div>

        <FormError message={error} />
        <div className="card overflow-x-auto !p-0">
          {!rows ? <p className="p-6 text-muted"><Busy label="Loading your cases…" /></p> : (
            <table className="w-full min-w-[760px] border-collapse text-[.95rem]">
              <thead>
                <tr className="border-b border-line text-start text-xs tracking-wide text-muted uppercase">
                  {['Case ID', 'Type', 'Received', 'Status', 'Last action', 'Alerts'].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No cases match these filters.</td></tr>}
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3.5"><Link to={`/staff/cases/${r.id}`} className="font-mono font-bold">{r.id}</Link></td>
                    <td className="px-4 py-3.5">{r.category}<span className="block text-xs text-muted">{MODE[r.mode]}{r.aboutOther ? ' · witness' : ''}</span></td>
                    <td className="px-4 py-3.5">{date(r.submittedAt)}</td>
                    <td className="px-4 py-3.5"><span className={`badge ${STATUS_BADGE[r.status]}`}><span className="h-2 w-2 rounded-full bg-current" />{STATUS_LABEL[r.status]}</span></td>
                    <td className="px-4 py-3.5 text-muted">{r.lastActionAt ? ago(r.lastActionAt) : 'Not yet'}</td>
                    <td className="px-4 py-3.5">
                      <span className="flex flex-wrap gap-1.5">
                        {r.waiting && <span className="badge badge-inq"><Icon name="clock" size={13} />Waiting too long</span>}
                        {r.needsMyApproval && <span className="badge badge-pend"><Icon name="users" size={13} />Needs your approval</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="flex items-center gap-2 text-sm text-muted"><Icon name="lock" size={16} />You only see cases locked for you. Cases you were kept away from never appear.</p>
      </div>
    </StaffLayout>
  );
}
