import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { ReadAloud } from '../components/ReadAloud';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { FileThumb } from '../components/FileThumb';
import { Busy, FormError, TextField } from '../components/Field';
import { useReporter } from '../auth/ReporterAuth';
import { errorText } from '../lib/errors';
import { cleanFile, formatDuration, formatSize, kindOf, MAX_FILE_BYTES } from '../lib/media';
import {
  addToLocker, blankEntry, dateLabel, deleteEntry, deleteLocker, groupKey, loadEntries, loadLocker, monthLabel, readLocker,
  saveEntry, sortKey, today, copyToReport, type DatePart, type Entry, type EntryData, type LockerItem,
} from '../lib/journal';

type Tab = 'timeline' | 'locker';

// The private journal: write things down while they are fresh, keep evidence safe, and decide later
// whether to report. Only the owner's password can unlock any of it.
export default function Journal() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { session } = useReporter();
  const mk = session?.masterKey;
  const lang = i18n.language;

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [files, setFiles] = useState<LockerItem[]>([]);
  const [tab, setTab] = useState<Tab>('timeline');
  const [editing, setEditing] = useState<{ id?: string; data: EntryData } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<{ entries: string[]; files: string[] }>({ entries: [], files: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const urls = useRef<Record<string, string>>({});
  const [, force] = useState(0);

  useEffect(() => {
    if (!mk) return;
    Promise.all([loadEntries(mk), loadLocker(mk)])
      .then(([e, f]) => { setEntries(e); setFiles(f); })
      .catch((e) => setError(errorText(e, t)));
  }, [mk]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)), []);

  /** Decrypts a locker file for viewing or listening, only when the person asks for it. */
  const ensureUrl = async (f: LockerItem) => {
    if (!mk || urls.current[f.id]) return urls.current[f.id];
    try {
      const bytes = await readLocker(mk, f.id);
      urls.current[f.id] = URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.mime }));
      force((n) => n + 1);
      return urls.current[f.id];
    } catch {
      return undefined;
    }
  };

  const fileById = useMemo(() => Object.fromEntries(files.map((f) => [f.id, f])), [files]);
  const groups = useMemo(() => {
    const sorted = [...(entries ?? [])].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const out: { key: string; items: Entry[] }[] = [];
    for (const e of sorted) {
      const k = groupKey(e);
      const g = out.find((x) => x.key === k);
      if (g) g.items.push(e);
      else out.push({ key: k, items: [e] });
    }
    // "Date not sure" goes last.
    return [...out.filter((g) => g.key !== 'unsure'), ...out.filter((g) => g.key === 'unsure')];
  }, [entries]);

  const onSaved = (entry: Entry, newFiles: LockerItem[]) => {
    setEntries((old) => {
      const prev = (old ?? []).find((e) => e.id === entry.id);
      return [...(old ?? []).filter((e) => e.id !== entry.id), prev ? { ...entry, createdAt: prev.createdAt } : entry];
    });
    setFiles((old) => [...old.filter((f) => !newFiles.some((n) => n.id === f.id)), ...newFiles]);
    setEditing(null);
    setNotice(t('journal.saved'));
  };

  const removeEntry = async (id: string) => {
    setError('');
    try {
      await deleteEntry(id);
      setEntries((old) => (old ?? []).filter((e) => e.id !== id));
      setNotice(t('journal.deleted'));
    } catch (e) {
      setError(errorText(e, t));
    }
  };

  const removeFile = async (f: LockerItem) => {
    if (!mk) return;
    setError('');
    try {
      // Entries that pointed at this file are updated first, so no entry is left pointing at nothing.
      for (const e of (entries ?? []).filter((x) => x.fileIds.includes(f.id))) {
        const data: EntryData = { v: 1, date: e.date, text: e.text, where: e.where, fileIds: e.fileIds.filter((x) => x !== f.id) };
        await saveEntry(mk, data, e.id);
        setEntries((old) => (old ?? []).map((x) => (x.id === e.id ? { ...x, ...data } : x)));
      }
      await deleteLocker(f.id);
      setFiles((old) => old.filter((x) => x.id !== f.id));
      setNotice(t('journal.fileDeleted'));
    } catch (e) {
      setError(errorText(e, t));
    }
  };

  const addFiles = async (list: File[]) => {
    if (!mk || !list.length) return [];
    setError('');
    const added: LockerItem[] = [];
    for (const file of list) {
      const kind = kindOf(file);
      if (!kind) { setError(t('evidence.badType')); continue; }
      if (file.size > MAX_FILE_BYTES) { setError(t('evidence.tooBig')); continue; }
      setBusy(t('evidence.cleaning'));
      try {
        const clean = await cleanFile(file);
        const n = files.filter((f) => f.kind === clean.kind).length + added.filter((f) => f.kind === clean.kind).length + 1;
        added.push(await addToLocker(mk, clean.bytes, { v: 1, kind: clean.kind, mime: clean.mime, label: t(clean.kind === 'image' ? 'evidence.photoN' : 'evidence.docN', { n }) }));
      } catch (e) {
        const m = (e as Error).message;
        setError(m === 'type' ? t('evidence.badType') : m === 'size' ? t('evidence.tooBig') : errorText(e, t) || t('evidence.cantRead'));
      }
    }
    setBusy('');
    return added;
  };

  const toggle = (which: 'entries' | 'files', id: string) =>
    setPicked((p) => ({ ...p, [which]: p[which].includes(id) ? p[which].filter((x) => x !== id) : [...p[which], id] }));
  const pickedCount = picked.entries.length + picked.files.length;

  const sendToReport = async () => {
    if (!mk || !entries) return;
    setError('');
    setBusy(t('journal.copying'));
    try {
      const res = await copyToReport(mk, entries.filter((e) => picked.entries.includes(e.id)), picked.files, files, t, lang);
      nav('/report', { state: { fromJournal: res } });
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'tooManyFiles' ? t('journal.tooManyFiles') : m === 'tooManyVoice' ? t('journal.tooManyVoice') : errorText(e, t));
      setBusy('');
    }
  };

  if (!entries) {
    return (
      <Layout>
        <div className="flex min-h-60 items-center justify-center text-muted" aria-busy="true">{error || <Busy label={t('journal.loading')} />}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 data-read className="text-[1.6rem] leading-tight font-extrabold lg:text-[2rem]">{t('journal.title')}</h1>
          <p data-read className="text-muted">{t('journal.sub')}</p>
          <ReadAloud />
        </div>
        <div className="card-soft flex items-start gap-3 text-[.95rem]">
          <span className="icon-tile sm !bg-surface"><Icon name="lock" size={18} /></span>
          <span data-read>{t('journal.private')}</span>
        </div>

        <div role="tablist" aria-label={t('journal.title')} className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
          {(['timeline', 'locker'] as Tab[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold ${tab === k ? 'bg-surface text-primary shadow' : 'text-text'}`}>
              <Icon name={k === 'timeline' ? 'calendar' : 'box'} size={18} />
              {k === 'locker' ? <><span className="sm:hidden">{t('journal.tab.lockerShort')}</span><span className="hidden sm:inline">{t('journal.tab.locker')}</span></> : t('journal.tab.timeline')}
              <span className="rounded-full bg-surface-2 px-2 text-sm text-muted">{k === 'timeline' ? entries.length : files.length}</span>
            </button>
          ))}
        </div>

        {notice && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Icon name="check" size={16} />{notice}</p>}
        <FormError message={error} />
        {busy && <p role="status" className="text-sm"><Busy label={busy} /></p>}

        {!editing && (
          <div className="flex flex-wrap gap-2">
            {tab === 'timeline' && !selecting && (
              <button type="button" className="btn btn-primary" onClick={() => { setNotice(''); setEditing({ data: blankEntry() }); }}><Icon name="plus" size={18} />{t('journal.add')}</button>
            )}
            {tab === 'locker' && !selecting && (
              <label className="btn btn-primary cursor-pointer">
                <Icon name="upload" size={18} />{t('journal.addFiles')}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only"
                  onChange={async (e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; const a = await addFiles(l); if (a.length) { setFiles((o) => [...o, ...a]); setNotice(t('journal.filesAdded', { count: a.length })); } }} />
              </label>
            )}
            {(entries.length > 0 || files.length > 0) && (
              <button type="button" className="btn btn-outline" aria-pressed={selecting} onClick={() => { setSelecting((s) => !s); setPicked({ entries: [], files: [] }); setNotice(''); }}>
                <Icon name={selecting ? 'x' : 'send'} size={18} />{selecting ? t('journal.cancel') : t('journal.choose')}
              </button>
            )}
          </div>
        )}

        {selecting && (
          <div className="card flex flex-col gap-3 border-2 !border-primary">
            <p data-read>{t('journal.chooseHelp')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <b role="status">{t('journal.selected', { count: pickedCount })}</b>
              <button type="button" className="btn btn-primary ms-auto" disabled={!pickedCount || !!busy} onClick={sendToReport}>
                <Icon name="arrow" size={18} />{t('journal.useInReport')}
              </button>
            </div>
          </div>
        )}

        {editing && mk && (
          <EntryEditor mk={mk} initial={editing.data} id={editing.id} existingFiles={files} onCancel={() => setEditing(null)} onSaved={onSaved} addFiles={addFiles}
            ensureUrl={ensureUrl} urls={urls.current} />
        )}

        {tab === 'timeline' && !editing && (
          entries.length === 0 ? (
            <Empty icon="book" title={t('journal.emptyTitle')} body={t('journal.emptyBody')} />
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-3">
                  <h2 id={`g-${g.key}`} className="flex items-center gap-2 text-sm font-bold tracking-wide text-muted uppercase">
                    <Icon name="calendar" size={16} />{g.key === 'unsure' ? t('journal.dateUnsure') : monthLabel(g.key, lang)}
                  </h2>
                  <ol className="flex flex-col gap-3 border-s-2 border-primary-soft ps-4">
                    {g.items.map((e) => (
                      <EntryCard key={e.id} e={e} files={e.fileIds.map((id) => fileById[id]).filter(Boolean)} lang={lang}
                        selecting={selecting} picked={picked.entries.includes(e.id)} onPick={() => toggle('entries', e.id)}
                        onEdit={() => { setNotice(''); setEditing({ id: e.id, data: { v: 1, date: e.date, text: e.text, where: e.where, fileIds: e.fileIds } }); window.scrollTo({ top: 0 }); }}
                        onDelete={() => removeEntry(e.id)} ensureUrl={ensureUrl} urls={urls.current} />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )
        )}

        {tab === 'locker' && !editing && (
          files.length === 0 ? (
            <Empty icon="box" title={t('journal.lockerEmptyTitle')} body={t('journal.lockerEmptyBody')} />
          ) : (
            <>
              <p className="text-sm text-muted" data-read>{t('evidence.cleanNote')}</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[...files].reverse().map((f) => (
                  <LockerCard key={f.id} f={f} lang={lang} usedIn={(entries ?? []).filter((e) => e.fileIds.includes(f.id)).length}
                    selecting={selecting} picked={picked.files.includes(f.id)} onPick={() => toggle('files', f.id)}
                    onDelete={() => removeFile(f)} ensureUrl={ensureUrl} url={urls.current[f.id]} />
                ))}
              </ul>
            </>
          )
        )}
      </div>
    </Layout>
  );
}

function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <span className="icon-tile"><Icon name={icon} size={24} /></span>
      <b className="text-lg">{title}</b>
      <p className="max-w-md text-muted">{body}</p>
    </div>
  );
}

/** Inline "are you sure?" instead of a browser dialog. */
function ConfirmDelete({ label, note, onYes }: { label: string; note?: string; onYes: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="btn btn-quiet btn-sm !px-2.5" onClick={() => setAsking(true)} aria-label={t('journal.deleteThis', { name: label })}><Icon name="trash" size={16} /></button>;
  }
  return (
    <span role="group" aria-label={t('journal.confirmTitle')} className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-accent-soft p-2 text-sm">
      <span className="flex-1">{note ?? t('journal.confirmTitle')}</span>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => setAsking(false)}>{t('journal.keep')}</button>
      <button type="button" className="btn btn-sm btn-primary" onClick={onYes}>{t('journal.yesDelete')}</button>
    </span>
  );
}

function VoicePlayer({ f, url, ensureUrl }: { f: LockerItem; url?: string; ensureUrl: (f: LockerItem) => Promise<string | undefined> }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="icon-tile sm"><Icon name="mic" size={16} /></span>
      <span className="text-sm font-semibold">{f.label}</span>
      {f.seconds ? <span className="text-xs text-muted">{formatDuration(f.seconds)}</span> : null}
      {url ? <audio controls src={url} className="h-10 max-w-[13rem]" /> : (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => ensureUrl(f)}><Icon name="play" size={16} />{t('report.listen')}</button>
      )}
    </span>
  );
}

function EntryCard({ e, files, lang, selecting, picked, onPick, onEdit, onDelete, ensureUrl, urls }: {
  e: Entry; files: LockerItem[]; lang: string; selecting: boolean; picked: boolean; onPick: () => void; onEdit: () => void; onDelete: () => void;
  ensureUrl: (f: LockerItem) => Promise<string | undefined>; urls: Record<string, string>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = e.text.length > 280;
  const voice = files.filter((f) => f.kind === 'voice');
  const docs = files.filter((f) => f.kind !== 'voice');
  const title = dateLabel(e.date, t, lang);
  return (
    <li className={`card relative flex flex-col gap-2 ${picked ? '!border-primary ring-4 ring-primary-soft' : ''}`}>
      <span aria-hidden="true" className="absolute top-6 -start-[1.4rem] h-3 w-3 rounded-full border-2 border-primary bg-bg" />
      <div className="flex items-start gap-3">
        {selecting && <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={picked} onChange={onPick} aria-label={t('journal.pickEntry', { date: title })} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <b className="flex items-center gap-2">{e.date.kind !== 'exact' && <span className="badge badge-rev">{t('journal.rough')}</span>}{title}</b>
          {e.where.trim() && <span className="flex items-center gap-1 text-sm text-muted"><Icon name="map" size={14} />{e.where}</span>}
        </div>
        {!selecting && (
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" className="btn btn-quiet btn-sm !px-2.5" onClick={onEdit} aria-label={t('journal.editThis', { date: title })}><Icon name="edit" size={16} /></button>
            <ConfirmDelete label={title} note={files.length ? t('journal.confirmEntryFiles') : t('journal.confirmEntry')} onYes={onDelete} />
          </span>
        )}
      </div>
      {e.text.trim() && (
        <p className={`whitespace-pre-wrap ${long && !open ? 'line-clamp-4' : ''}`}>{e.text}</p>
      )}
      {long && <button type="button" className="self-start text-sm text-primary underline" onClick={() => setOpen((o) => !o)}>{open ? t('journal.less') : t('journal.more')}</button>}
      {voice.map((f) => <VoicePlayer key={f.id} f={f} url={urls[f.id]} ensureUrl={ensureUrl} />)}
      {docs.length > 0 && <span className="flex items-center gap-1 text-sm text-muted"><Icon name="image" size={14} />{t('journal.filesInLocker', { count: docs.length })}</span>}
    </li>
  );
}

function LockerCard({ f, lang, usedIn, selecting, picked, onPick, onDelete, ensureUrl, url }: {
  f: LockerItem; lang: string; usedIn: number; selecting: boolean; picked: boolean; onPick: () => void; onDelete: () => void;
  ensureUrl: (f: LockerItem) => Promise<string | undefined>; url?: string;
}) {
  const { t } = useTranslation();
  const open = async () => {
    const u = url ?? (await ensureUrl(f));
    if (u) window.open(u, '_blank', 'noopener');
  };
  return (
    <li className={`card flex flex-col gap-2 !p-3 ${picked ? '!border-primary ring-4 ring-primary-soft' : ''}`}>
      {f.kind === 'voice' ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl bg-surface-2 p-2 text-primary">
          <Icon name="mic" size={36} />
          {url ? <audio controls src={url} className="h-10 w-full" /> : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => ensureUrl(f)}><Icon name="play" size={16} />{t('report.listen')}</button>
          )}
        </div>
      ) : (
        <FileThumb kind={f.kind} url={url} onNeed={() => ensureUrl(f)} />
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{f.label}</span>
          <span className="block text-xs text-muted">{new Date(f.createdAt).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatSize(f.size)}</span>
          <span className="flex items-center gap-1 text-xs text-muted"><Icon name="check" size={12} />{t(f.kind === 'voice' ? 'journal.encrypted' : 'evidence.cleaned')}</span>
        </span>
        {selecting ? (
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]" checked={picked} onChange={onPick} aria-label={t('journal.pickFile', { name: f.label })} />
        ) : (
          <ConfirmDelete label={f.label} note={usedIn ? t('journal.confirmFileUsed', { count: usedIn }) : t('journal.confirmFile')} onYes={onDelete} />
        )}
      </div>
      {f.kind === 'pdf' && !selecting && (
        <button type="button" className="btn btn-quiet btn-sm self-start" onClick={open}><Icon name="file" size={16} />{t('journal.openPdf')}</button>
      )}
    </li>
  );
}

const PARTS: DatePart[] = ['early', 'mid', 'late', 'any'];

function EntryEditor({ mk, initial, id, existingFiles, onCancel, onSaved, addFiles, ensureUrl, urls }: {
  mk: Uint8Array; initial: EntryData; id?: string; existingFiles: LockerItem[];
  onCancel: () => void; onSaved: (e: Entry, newFiles: LockerItem[]) => void; addFiles: (l: File[]) => Promise<LockerItem[]>;
  ensureUrl: (f: LockerItem) => Promise<string | undefined>; urls: Record<string, string>;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<EntryData>(initial);
  const [added, setAdded] = useState<LockerItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const all = [...existingFiles, ...added];
  const linked = data.fileIds.map((fid) => all.find((f) => f.id === fid)).filter((f): f is LockerItem => !!f);
  const upd = (p: Partial<EntryData>) => setData((d) => ({ ...d, ...p }));
  const kind = data.date.kind;
  const thisMonth = today().slice(0, 7);

  const addVoice = async (bytes: Uint8Array, mime: string, seconds: number) => {
    setError('');
    try {
      const n = all.filter((f) => f.kind === 'voice').length + 1;
      const item = await addToLocker(mk, bytes, { v: 1, kind: 'voice', mime, label: t('report.voiceLabel', { n }), seconds });
      setAdded((a) => [...a, item]);
      setData((d) => ({ ...d, fileIds: [...d.fileIds, item.id] }));
    } catch (e) {
      setError(errorText(e, t));
    }
  };

  // Files recorded or added while writing a NEW entry are removed again if the person cancels.
  const cancel = async () => {
    for (const f of added) await deleteLocker(f.id).catch(() => {});
    onCancel();
  };

  const save = async () => {
    if (!data.text.trim() && !linked.length) {
      setError(t('journal.needSomething'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const clean: EntryData = { ...data, text: data.text.trim(), where: data.where.trim() };
      const newId = await saveEntry(mk, clean, id);
      const now = new Date().toISOString();
      onSaved({ ...clean, id: newId, createdAt: now, updatedAt: now }, added);
    } catch (e) {
      setError(errorText(e, t));
      setSaving(false);
    }
  };

  return (
    <section className="card flex flex-col gap-5 border-2 !border-primary" aria-labelledby="ed-title">
      <h2 id="ed-title" ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">{id ? t('journal.editTitle') : t('journal.newTitle')}</h2>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-bold">{t('journal.when')}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="pill" aria-pressed={kind === 'exact'} onClick={() => upd({ date: { kind: 'exact', date: data.date.kind === 'exact' ? data.date.date : today() } })}>{t('journal.onDate')}</button>
          <button type="button" className="pill" aria-pressed={kind === 'month'} onClick={() => upd({ date: { kind: 'month', month: thisMonth, part: 'any' } })}>{t('journal.roughly')}</button>
          <button type="button" className="pill" aria-pressed={kind === 'unsure'} onClick={() => upd({ date: { kind: 'unsure' } })}>{t('journal.notSure')}</button>
        </div>
        {data.date.kind === 'exact' && (
          <label className="field max-w-xs">
            <span className="label">{t('journal.date')}</span>
            <input type="date" className="input" value={data.date.date} max={today()} onChange={(e) => e.target.value && upd({ date: { kind: 'exact', date: e.target.value } })} />
          </label>
        )}
        {data.date.kind === 'month' && (
          <div className="flex flex-col gap-3">
            <label className="field max-w-xs">
              <span className="label">{t('journal.month')}</span>
              <input type="month" className="input" value={data.date.month} max={thisMonth}
                onChange={(e) => e.target.value && data.date.kind === 'month' && upd({ date: { ...data.date, month: e.target.value } })} />
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('journal.whichPart')}>
              {PARTS.map((p) => (
                <button key={p} type="button" className="pill" aria-pressed={data.date.kind === 'month' && data.date.part === p}
                  onClick={() => data.date.kind === 'month' && upd({ date: { ...data.date, part: p } })}>{t(`journal.partPick.${p}`)}</button>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="jtext" className="label">{t('journal.what')}</label>
        <textarea id="jtext" className="input min-h-36 py-3" value={data.text} onChange={(e) => upd({ text: e.target.value })} maxLength={20000} placeholder={t('journal.whatPlaceholder')} />
        <span className="text-sm text-muted">{t('journal.whatHint')}</span>
      </div>
      <TextField label={t('journal.where')} hint={t('journal.whereHint')} value={data.where} onChange={(e) => upd({ where: e.target.value })} maxLength={300} />

      <div className="flex flex-col gap-3">
        <b>{t('journal.voiceAndFiles')}</b>
        <VoiceRecorder onSave={addVoice} />
        <label className="btn btn-outline cursor-pointer self-start">
          <Icon name="upload" size={18} />{t('journal.attach')}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only"
            onChange={async (e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; const a = await addFiles(l); if (a.length) { setAdded((x) => [...x, ...a]); setData((d) => ({ ...d, fileIds: [...d.fileIds, ...a.map((f) => f.id)] })); } }} />
        </label>
        {linked.length > 0 && (
          <ul className="flex flex-col gap-2">
            {linked.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2">
                {f.kind === 'voice' ? <VoicePlayer f={f} url={urls[f.id]} ensureUrl={ensureUrl} /> : (
                  <span className="flex items-center gap-2 text-sm font-semibold"><Icon name={f.kind === 'pdf' ? 'file' : 'image'} size={16} />{f.label}</span>
                )}
                <button type="button" className="btn btn-quiet btn-sm ms-auto" onClick={() => upd({ fileIds: data.fileIds.filter((x) => x !== f.id) })}>{t('journal.unlink')}</button>
              </li>
            ))}
          </ul>
        )}
        <span className="text-sm text-muted">{t('journal.filesNote')}</span>
      </div>

      <FormError message={error} />
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <button type="button" className="btn btn-outline" onClick={cancel} disabled={saving}>{t('journal.cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Busy label={t('journal.saving')} /> : <><Icon name="check" size={18} />{t('journal.save')}</>}</button>
      </div>
    </section>
  );
}
