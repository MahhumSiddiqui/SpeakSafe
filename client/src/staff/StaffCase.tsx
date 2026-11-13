import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { StaffLayout } from './StaffLayout';
import { useStaff } from './StaffAuth';
import { decryptCase, decryptNote, encryptNote, fetchStaffAttachment, openCaseKey, sealKeyFor, sealMatches } from './caseCrypto';
import { Icon } from '../components/Icon';
import { Busy, FormError } from '../components/Field';
import { api, ApiError } from '../lib/api';
import { formatDuration, formatSize } from '../lib/media';
import { STATUS_BADGE, type ReportContent, type Status } from '../pages/cases/caseData';
import { Composer, MessageThread, type ThreadItem } from '../components/MessageThread';
import { decryptMessage, encryptMessage } from '../lib/messages';
import { encryptBytes } from '../lib/reportCrypto';
import { postBytes } from '../lib/binary';

interface Detail {
  id: string; category: string; mode: 'ANONYMOUS' | 'CONFIDENTIAL' | 'NAMED'; status: Status; aboutOther: boolean;
  submittedAt: string; lastActionAt: string | null; nonce: string; ciphertext: string; fingerprint: string; sealedKey: string;
  readers: { id: string; displayName: string; me: boolean }[];
  attachments: { id: string; kind: 'image' | 'pdf' | 'voice'; mimeType: string; size: number; createdAt: string }[];
  notes: { id: string; by: string; mine: boolean; nonce: string; ciphertext: string; createdAt: string }[];
  closures: { id: string; status: string; requestedBy: string; requestedByMe: boolean; approvedBy: string | null; requestedAt: string; decidedAt: string | null }[];
  activity: { at: string; action: string; by: string; details: Record<string, string> | null }[];
  messages: { id: string; from: 'reporter' | 'committee'; by: string | null; mine: boolean; nonce: string; ciphertext: string; createdAt: string }[];
  templates: { id: number; title: string; body: string }[];
}
const STATUS_LABEL: Record<Status, string> = { RECEIVED: 'Received', UNDER_REVIEW: 'Under review', INQUIRY: 'Inquiry', PENDING_CLOSURE: 'Closure pending', CLOSED: 'Closed' };
const WHEN: Record<string, string> = { week: 'This week', month: 'This month', earlier: 'Earlier', unsure: 'Not sure' };
const when = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const err = (e: unknown) => (e instanceof ApiError && !e.message.startsWith('errors.') ? e.message : 'Something went wrong. Please try again.');

function activityText(a: Detail['activity'][number]) {
  const d = a.details ?? {};
  switch (a.action) {
    case 'CASE_SUBMITTED': return 'Report received';
    case 'ATTACHMENT_ADDED': return `Reporter added a ${d.kind === 'voice' ? 'voice note' : 'file'}`;
    case 'CASE_VIEWED': return `${a.by} opened the case`;
    case 'ATTACHMENT_OPENED': return `${a.by} opened a ${d.kind === 'voice' ? 'voice note' : 'file'}`;
    case 'STATUS_CHANGED': return `${a.by} changed status: ${STATUS_LABEL[d.from as Status] ?? d.from} → ${STATUS_LABEL[d.to as Status] ?? d.to}`;
    case 'NOTE_ADDED': return `${a.by} added a private note`;
    case 'RECUSED': return `${a.by} stepped away; case handed to ${d.handedTo}`;
    case 'CLOSURE_REQUESTED': return `${a.by} asked to close the case`;
    case 'CASE_CLOSED': return `${a.by} approved closure; case closed`;
    case 'CLOSURE_REJECTED': return `${a.by} did not approve closure`;
    case 'MESSAGE_SENT': return a.by === 'Reporter' ? 'Reporter sent a message' : `${a.by} sent a message to the reporter`;
    default: return a.action;
  }
}

export default function StaffCase() {
  const { id } = useParams();
  const nav = useNavigate();
  const { keys } = useStaff();
  const [d, setD] = useState<Detail | null>(null);
  const [report, setReport] = useState<ReportContent | null>(null);
  const [contentKey, setContentKey] = useState<Uint8Array | null>(null);
  const [sealOk, setSealOk] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const recuseRef = useRef<HTMLDialogElement>(null);
  const [candidate, setCandidate] = useState<{ id: string; displayName: string; publicKey: string } | null>(null);

  const load = useCallback(async () => {
    if (!keys || !id) return;
    const det = await api<Detail>(`/staff/cases/${id}`);
    const ck = await openCaseKey(det.sealedKey, keys);
    setSealOk(await sealMatches(det.nonce, det.ciphertext, det.fingerprint));
    setReport(await decryptCase<ReportContent>(ck, det.nonce, det.ciphertext));
    const plain: Record<string, string> = {};
    for (const n of det.notes) plain[n.id] = await decryptNote(ck, n.nonce, n.ciphertext).catch(() => '(This note could not be opened.)');
    setNotes(plain);
    const items: ThreadItem[] = [];
    for (const m of det.messages) items.push({ id: m.id, mine: m.mine, who: m.from === 'reporter' ? 'Reporter' : m.mine ? 'You' : (m.by ?? 'Committee'), at: m.createdAt, payload: await decryptMessage(ck, m) });
    setThread(items);
    setContentKey(ck);
    setD(det);
  }, [keys, id]);

  useEffect(() => { load().catch((e) => setError(err(e))); }, [load]);

  const showToast = (text: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 10000);
  };

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(err(e)); } finally { setBusy(''); }
  };

  const changeStatus = (status: Status) => act('status', async () => {
    const r = await api<{ status: Status; previous?: Status }>(`/staff/cases/${id}/status`, { method: 'PATCH', body: { status } });
    if (r.previous) showToast(`Status changed to ${STATUS_LABEL[status]}`, () => {
      setToast(null);
      act('status', async () => { await api(`/staff/cases/${id}/status`, { method: 'PATCH', body: { status: r.previous } }); });
    });
  });

  const addNote = () => {
    if (!note.trim() || !contentKey) return;
    act('note', async () => {
      await api(`/staff/cases/${id}/notes`, { body: await encryptNote(contentKey, note.trim()) });
      setNote('');
      showToast('Note added');
    });
  };

  const startRecuse = async () => {
    setError('');
    try {
      setCandidate(await api(`/staff/cases/${id}/recuse-candidate`));
      recuseRef.current?.showModal();
    } catch (e) { setError(err(e)); }
  };
  const confirmRecuse = async () => {
    if (!candidate || !contentKey) return;
    setBusy('recuse');
    try {
      await api(`/staff/cases/${id}/recuse`, { body: { newReaderId: candidate.id, sealedKey: await sealKeyFor(contentKey, candidate.publicKey) } });
      recuseRef.current?.close();
      nav('/staff', { replace: true });
    } catch (e) { setError(err(e)); recuseRef.current?.close(); } finally { setBusy(''); }
  };

  const sendMessage = async (text: string, voice?: { bytes: Uint8Array; mime: string; seconds: number }) => {
    if (!contentKey || !d) return;
    setError('');
    try {
      let v: { id: string; seconds: number } | undefined;
      if (voice) {
        const r = await postBytes(`/staff/cases/${d.id}/attachments`, await encryptBytes(contentKey, voice.bytes), { 'X-Attachment-Type': voice.mime });
        v = { id: r.id, seconds: voice.seconds };
      }
      await api(`/staff/cases/${d.id}/messages`, { body: await encryptMessage(contentKey, { text, voice: v }) });
      await load();
      showToast('Message sent to the reporter');
    } catch (e) {
      setError(err(e));
      throw e;
    }
  };
  const loadVoice = async (aid: string) => URL.createObjectURL(new Blob([(await fetchStaffAttachment(d!.id, aid, contentKey!)) as BlobPart], { type: 'audio/webm' }));

  // Ctrl + Enter adds a note (keyboard shortcut for frequent users).
  const onNoteKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote(); };

  if (!keys) {
    return <StaffLayout><FormError message="Your encryption keys are locked. Please sign out and sign in again." /></StaffLayout>;
  }

  const pending = d?.closures.find((c) => c.status === 'PENDING');
  const other = d?.readers.find((r) => !r.me);
  const locked = d?.status === 'CLOSED' || d?.status === 'PENDING_CLOSURE';

  return (
    <StaffLayout>
      <div className="flex flex-col gap-5">
        <Link to="/staff" className="inline-flex min-h-11 items-center gap-1 self-start text-sm no-underline"><Icon name="back" size={16} />My cases</Link>
        <FormError message={error} />
        {!d || !report ? (!error && <p className="text-muted"><Busy label="Decrypting on this computer…" /></p>) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-mono text-2xl font-bold lg:text-3xl">{d.id}</h1>
                  <span className={`badge ${STATUS_BADGE[d.status]} !text-sm`}><span className="h-2 w-2 rounded-full bg-current" />{STATUS_LABEL[d.status]}</span>
                </div>
                <p className="text-muted">{d.category} · {d.mode[0] + d.mode.slice(1).toLowerCase()} · received {when(d.submittedAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">Status
                  <select className="input !min-h-11 !w-auto" value={locked ? '' : d.status} disabled={locked || !!busy} onChange={(e) => changeStatus(e.target.value as Status)}>
                    {locked && <option value="">{STATUS_LABEL[d.status]}</option>}
                    <option value="RECEIVED">Received</option>
                    <option value="UNDER_REVIEW">Under review</option>
                    <option value="INQUIRY">Inquiry</option>
                  </select>
                </label>
                {d.status !== 'CLOSED' && <button type="button" className="btn btn-quiet btn-sm" onClick={startRecuse} disabled={!!busy}>Recuse myself</button>}
                {!locked && <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('closure', async () => { await api(`/staff/cases/${id}/closure`, { method: 'POST' }); showToast('Closure requested. A second member must approve.'); })}>Request closure</button>}
              </div>
            </div>

            {pending && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] p-4" style={{ background: 'var(--b-pend-bg)', color: 'var(--b-pend)' }}>
                <span className="flex items-center gap-3"><Icon name="users" />
                  {pending.requestedByMe ? <span><b>You asked to close this case.</b> Waiting for {other?.displayName ?? 'the second member'} to approve.</span>
                    : <span><b>{pending.requestedBy} asked to close this case.</b> Two members must agree.</span>}
                </span>
                {!pending.requestedByMe && (
                  <span className="flex gap-2">
                    <button type="button" className="btn btn-sm bg-surface text-text" disabled={!!busy} onClick={() => act('decide', () => api(`/staff/cases/${id}/closure/${pending.id}/decision`, { body: { approve: false } }).then(() => {}))}>Not yet</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('decide', () => api(`/staff/cases/${id}/closure/${pending.id}/decision`, { body: { approve: true } }).then(() => {}))}>Approve closure</button>
                  </span>
                )}
              </div>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-5">
                <section className="card flex flex-col gap-4 lg:p-6" aria-labelledby="rep-h">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="rep-h" className="text-lg font-bold">Report</h2>
                    {sealOk ? <span className="badge badge-clo"><Icon name="check" size={13} />Seal matches · decrypted on this computer</span>
                      : <span className="badge badge-inq"><Icon name="alert" size={13} />Seal does not match: report may have been altered</span>}
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Fact label="When" value={WHEN[report.when] ?? report.when} />
                    <Fact label="Where" value={report.where || 'Not given'} />
                    <Fact label="Reporter" value={report.identity.mode === 'ANONYMOUS' ? 'Anonymous' : `${report.identity.name}${report.identity.contact ? ` · ${report.identity.contact}` : ''}`} />
                    <Fact label="Happened to" value={report.aboutOther ? 'Someone else (witness)' : 'The reporter'} />
                  </dl>
                  {report.description ? <p className="leading-relaxed whitespace-pre-wrap">{report.description}</p> : <p className="text-muted italic">No written description. See the voice note below.</p>}
                  {d.attachments.length > 0 && contentKey && (
                    <div className="flex flex-col gap-3">
                      <h3 className="font-bold">Voice notes and evidence</h3>
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {d.attachments.map((a, i) => <li key={a.id}><StaffAttachment caseId={d.id} a={a} n={i + 1} contentKey={contentKey} seconds={a.kind === 'voice' ? report.voiceNotes[d.attachments.slice(0, i).filter((x) => x.kind === 'voice').length]?.seconds : undefined} /></li>)}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-muted">Readers: {d.readers.map((r) => (r.me ? 'you' : r.displayName)).join(' and ')}.</p>
                </section>

                <section className="card flex flex-col gap-4 lg:p-6" aria-labelledby="msg-h">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="msg-h" className="text-lg font-bold">Messages with the reporter</h2>
                    <span className="badge badge-clo"><Icon name="lock" size={13} />Encrypted · only the reporter and readers</span>
                  </div>
                  <MessageThread items={thread} loadVoice={loadVoice} empty="No messages yet. A short, kind update helps the reporter feel heard." />
                  {d.status === 'CLOSED' ? <p className="text-sm text-muted">This case is closed.</p> : (
                    <Composer onSend={sendMessage} templates={d.templates}
                      labels={{ placeholder: 'Write to the reporter… (Ctrl + Enter to send)', send: 'Send', voice: 'Voice note', cancelVoice: 'Cancel voice note', sending: 'Sending…', templates: 'Templates:', voiceReady: 'Voice note ready' }} />
                  )}
                </section>
              </div>

              <aside className="flex flex-col gap-5">
                <section className="card flex flex-col gap-3" aria-labelledby="notes-h">
                  <h2 id="notes-h" className="font-bold">Private notes</h2>
                  <p className="text-xs text-muted">Only the readers of this case can see these. Notes can be added, never edited or deleted.</p>
                  {d.notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
                  <ul className="flex flex-col gap-2">
                    {d.notes.map((n) => (
                      <li key={n.id} className="card-soft !p-3 text-sm">
                        <b>{n.mine ? 'You' : n.by}</b> <span className="text-muted">· {when(n.createdAt)}</span>
                        <p className="mt-1 whitespace-pre-wrap">{notes[n.id]}</p>
                      </li>
                    ))}
                  </ul>
                  <label htmlFor="note" className="sr-only">Add a note</label>
                  <textarea id="note" className="input min-h-24 py-2.5" placeholder="Add a note… (Ctrl + Enter)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onNoteKey} maxLength={5000} />
                  <button type="button" className="btn btn-outline btn-sm" onClick={addNote} disabled={!note.trim() || !!busy}>{busy === 'note' ? <Busy label="Saving…" /> : 'Add note'}</button>
                </section>

                <section className="card flex flex-col gap-3" aria-labelledby="act-h">
                  <h2 id="act-h" className="font-bold">Activity</h2>
                  <ol className="flex flex-col gap-2.5 text-sm">
                    {d.activity.slice(0, 15).map((a, i) => (
                      <li key={i} className="flex flex-col"><span>{activityText(a)}</span><span className="text-xs text-muted">{when(a.at)}</span></li>
                    ))}
                  </ol>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-text px-5 py-3 text-bg shadow-xl">
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className="rounded-lg border border-current px-3 py-1 font-semibold" onClick={toast.undo}>Undo</button>}
        </div>
      )}

      <dialog ref={recuseRef} className="sheet" aria-labelledby="rec-h">
        <div className="flex flex-col gap-4 p-6">
          <h2 id="rec-h" className="text-xl font-bold">Step away from this case?</h2>
          <p>Recuse yourself if you have a conflict of interest, for example if you know the people involved.</p>
          {candidate && <p className="card-soft">The case will be handed to <b>{candidate.displayName}</b>, who has the lightest workload and was not kept away by the reporter. After this, you will no longer see it.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => recuseRef.current?.close()}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={confirmRecuse} disabled={busy === 'recuse'}>{busy === 'recuse' ? <Busy label="Handing over…" /> : 'Recuse and hand over'}</button>
          </div>
        </div>
      </dialog>
    </StaffLayout>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="card-soft !p-3"><dt className="text-xs text-muted">{label}</dt><dd className="font-semibold break-words">{value}</dd></div>;
}

/** Evidence opens only on request; pictures stay blurred until revealed (protects staff from sudden distressing images). */
function StaffAttachment({ caseId, a, n, contentKey, seconds }: { caseId: string; a: Detail['attachments'][number]; n: number; contentKey: Uint8Array; seconds?: number }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const label = a.kind === 'voice' ? `Voice note ${n}` : a.kind === 'image' ? `Photo ${n}` : `Document ${n}`;
  const load = async () => {
    setBusy(true);
    try { setUrl(URL.createObjectURL(new Blob([(await fetchStaffAttachment(caseId, a.id, contentKey)) as BlobPart], { type: a.mimeType }))); } finally { setBusy(false); }
  };
  return (
    <div className="card-soft flex flex-col gap-2 !p-3">
      <span className="flex items-center gap-2 font-semibold"><Icon name={a.kind === 'voice' ? 'mic' : a.kind === 'image' ? 'image' : 'file'} size={18} />{label}
        <span className="text-xs font-normal text-muted">{a.kind === 'voice' && seconds ? formatDuration(seconds) : formatSize(a.size)}</span></span>
      {!url ? (
        <button type="button" className="btn btn-sm self-start bg-surface" onClick={load} disabled={busy}>{busy ? <Busy label="Decrypting…" /> : <><Icon name="lock" size={16} />Decrypt and open</>}</button>
      ) : a.kind === 'voice' ? <audio controls src={url} className="w-full" />
        : a.kind === 'image' ? (
          <button type="button" onClick={() => setRevealed((r) => !r)} className="relative overflow-hidden rounded-xl" aria-label={revealed ? 'Hide picture' : 'Show picture'}>
            <img src={url} alt="" className={`max-h-72 w-full object-cover ${revealed ? '' : 'blur-xl'}`} />
            {!revealed && <span className="absolute inset-x-2 bottom-2 rounded-full bg-surface px-2 py-1 text-xs font-bold">Click to reveal</span>}
          </button>
        ) : <a href={url} download={`${caseId}-document-${n}.pdf`} className="btn btn-sm self-start bg-surface"><Icon name="file" size={16} />Download</a>}
    </div>
  );
}
