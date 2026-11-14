import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { ReadAloud } from '../../components/ReadAloud';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { Dictation } from '../../components/Dictation';
import { FileThumb } from '../../components/FileThumb';
import { Busy, FormError, TextField } from '../../components/Field';
import { useReporter } from '../../auth/ReporterAuth';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { cleanFile, formatDuration, formatSize, kindOf, MAX_FILE_BYTES } from '../../lib/media';
import { deleteDraftFile, discardDraft, emptyDraft, loadDraft, readDraftFile, uploadDraftFile, useAutosave, type FileRef, type Mode, type ReportDraft, type When } from './draft';
import { sendReport } from './send';

const STEPS = 6;
const MAX_FILES = 10;
const CATEGORY_ICONS: Record<string, string> = {
  Harassment: 'hand', Discrimination: 'userx', 'Academic misconduct': 'grad',
  'Fraud or financial misconduct': 'coins', 'Safety concern': 'shieldAlert', Other: 'more',
};

interface Category { id: number; name: string }
interface Member { id: string; displayName: string }

// Report a concern: six short steps, one question at a time, saved (encrypted) as you go.
export default function ReportWizard() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const fromJournal = (useLocation().state as { fromJournal?: { entries: number; files: number } } | null)?.fromJournal;
  const { session } = useReporter();
  const mk = session?.masterKey;
  const [d, setD] = useState<ReportDraft | null>(null);
  const [touched, setTouched] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<string>('');
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const { state: saveState, saveNow } = useAutosave(mk, d, touched);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!mk) return;
    (async () => {
      const [cats, mem, saved] = await Promise.all([
        api<Category[]>('/categories'),
        api<Member[]>('/committee'),
        loadDraft(mk).catch(() => null),
      ]);
      setCategories(cats);
      setMembers(mem);
      setD(saved?.draft ?? emptyDraft());
    })().catch((e) => setError(errorText(e, t)));
  }, [mk]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free preview URLs when leaving.
  useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (p: Partial<ReportDraft>) => {
    setD((old) => (old ? { ...old, ...p } : old));
    setTouched(true);
  };

  const goTo = (step: number) => {
    update({ step });
    setError('');
    window.scrollTo({ top: 0 });
    setTimeout(() => headingRef.current?.focus(), 50);
  };

  const category = categories.find((c) => c.id === d?.categoryId);
  const remaining = members.filter((m) => !d?.excluded.includes(m.id)).length;
  const valid = useMemo(() => {
    if (!d) return false;
    switch (d.step) {
      case 1: return !!d.categoryId;
      case 2: return d.description.trim().length > 0 || d.voice.length > 0;
      case 4: return !!d.mode && (d.mode === 'ANONYMOUS' || d.name.trim().length > 0);
      case 5: return remaining >= 2;
      default: return true;
    }
  }, [d, remaining]);

  const next = () => {
    if (!d) return;
    if (!valid) {
      setError(t(`report.need.${d.step}`));
      return;
    }
    goTo(d.step + 1);
  };

  const addVoice = async (bytes: Uint8Array, mime: string, seconds: number) => {
    if (!mk || !d) return;
    try {
      const fileId = await uploadDraftFile(mk, bytes);
      const ref: FileRef = { fileId, kind: 'voice', mime, size: bytes.length, label: t('report.voiceLabel', { n: d.voice.length + 1 }), seconds };
      setPreviews((p) => ({ ...p, [fileId]: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })) }));
      setD((old) => (old ? { ...old, voice: [...old.voice, ref] } : old));
      setTouched(true);
    } catch (e) {
      setError(errorText(e, t));
    }
  };

  const [processing, setProcessing] = useState(0);
  const addFiles = async (list: FileList | null) => {
    if (!mk || !d || !list) return;
    setError('');
    const files = Array.from(list).slice(0, MAX_FILES - d.files.length);
    for (const file of files) {
      if (!kindOf(file)) { setError(t('evidence.badType')); continue; }
      if (file.size > MAX_FILE_BYTES) { setError(t('evidence.tooBig')); continue; }
      setProcessing((n) => n + 1);
      try {
        const clean = await cleanFile(file);
        const fileId = await uploadDraftFile(mk, clean.bytes);
        setPreviews((p) => ({ ...p, [fileId]: URL.createObjectURL(new Blob([clean.bytes as BlobPart], { type: clean.mime })) }));
        setD((old) => old ? {
          ...old,
          files: [...old.files, { fileId, kind: clean.kind, mime: clean.mime, size: clean.bytes.length, label: t(clean.kind === 'image' ? 'evidence.photoN' : 'evidence.docN', { n: old.files.length + 1 }) }],
        } : old);
        setTouched(true);
      } catch (e) {
        setError((e as Error).message === 'type' ? t('evidence.badType') : t('evidence.cantRead'));
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  };

  const removeRef = async (which: 'voice' | 'files', ref: FileRef) => {
    setD((old) => (old ? { ...old, [which]: old[which].filter((f) => f.fileId !== ref.fileId) } : old));
    setTouched(true);
    deleteDraftFile(ref.fileId).catch(() => {});
  };

  // Previews for files restored from a saved draft are decrypted on demand.
  const ensurePreview = async (ref: FileRef) => {
    if (!mk || previews[ref.fileId]) return;
    try {
      const bytes = await readDraftFile(mk, ref.fileId);
      setPreviews((p) => ({ ...p, [ref.fileId]: URL.createObjectURL(new Blob([bytes as BlobPart], { type: ref.mime })) }));
    } catch {
      /* preview not essential */
    }
  };

  const send = async () => {
    if (!mk || !d || !category) return;
    setError('');
    try {
      await saveNow();
      const res = await sendReport(mk, d, category.name, (s) => setSending(t(`report.sending.${s}`)));
      nav('/report/sent', { replace: true, state: res });
    } catch (e) {
      setSending('');
      setError(errorText(e, t));
    }
  };

  const startOver = async () => {
    if (!d) return;
    for (const f of [...d.voice, ...d.files]) deleteDraftFile(f.fileId).catch(() => {});
    await discardDraft().catch(() => {});
    setD(emptyDraft());
    setTouched(false);
    setError('');
  };

  if (!d) {
    return (
      <Layout>
        <div className="flex min-h-60 items-center justify-center text-muted" aria-busy="true">{error || <Busy label={t('report.loading')} />}</div>
      </Layout>
    );
  }

  const stepNames = [1, 2, 3, 4, 5, 6].map((n) => t(`report.steps.${n}`));
  const minutesLeft = Math.max(1, Math.round((STEPS - d.step + 1) * 1.5));

  return (
    <Layout focus>
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Desktop: the whole journey at a glance */}
        <nav aria-label={t('report.progress')} className="hidden lg:block">
          <ol className="sticky top-24 flex flex-col gap-1">
            {stepNames.map((name, i) => {
              const n = i + 1;
              const done = n < d.step;
              const current = n === d.step;
              return (
                <li key={n}>
                  <button type="button" disabled={n > d.step} onClick={() => goTo(n)} aria-current={current ? 'step' : undefined}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start ${current ? 'bg-primary-soft font-bold text-primary' : done ? 'text-text-2 hover:bg-surface-2' : 'text-muted'}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-primary text-on-primary' : current ? 'border-2 border-primary' : 'border-2 border-line'}`}>
                      {done ? <Icon name="check" size={15} stroke={3} /> : n}
                    </span>
                    {name}
                  </button>
                </li>
              );
            })}
          </ol>
          <SaveBadge state={saveState} />
        </nav>

        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{t('report.stepOf', { n: d.step, total: STEPS, name: stepNames[d.step - 1] })}</span>
              <span className="inline-flex items-center gap-1"><Icon name="clock" size={16} />{t('report.minutesLeft', { n: minutesLeft })}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
              {stepNames.map((_, i) => <span key={i} className={`h-[7px] rounded-full ${i < d.step ? 'bg-primary' : 'bg-primary-soft'}`} />)}
            </div>
          </div>

          <h1 ref={headingRef} tabIndex={-1} data-read className="text-[1.6rem] leading-tight font-extrabold outline-none lg:text-[2rem]">{t(`report.q.${d.step}`)}</h1>
          <p data-read className="-mt-2 text-muted">{t(`report.help.${d.step}`, { name: '' })}</p>
          <ReadAloud />
          {fromJournal && d.step <= 3 && (
            <div role="status" className="card-soft flex items-start gap-3 text-[.95rem]">
              <span className="icon-tile sm !bg-surface"><Icon name="book" size={18} /></span>
              <span>{t('journal.addedToReport', { entries: fromJournal.entries, files: fromJournal.files })}</span>
            </div>
          )}

          {d.step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('report.q.1')}>
                {categories.map((c) => {
                  const on = d.categoryId === c.id;
                  return (
                    <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => update({ categoryId: c.id })}
                      className={`flex min-h-28 flex-col items-start gap-3 rounded-2xl border-2 bg-surface p-4 text-start font-semibold ${on ? 'border-primary ring-4 ring-primary-soft' : 'border-line hover:border-input'}`}>
                      <span className={`icon-tile sm ${on ? '' : '!bg-surface-2 !text-text-2'}`}><Icon name={CATEGORY_ICONS[c.name] ?? 'more'} size={20} /></span>
                      {t(`categories.${c.name}`, { defaultValue: c.name })}
                    </button>
                  );
                })}
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-bold">{t('report.who')}</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="pill" aria-pressed={!d.aboutOther} onClick={() => update({ aboutOther: false })}>{t('report.whoMe')}</button>
                  <button type="button" className="pill" aria-pressed={d.aboutOther} onClick={() => update({ aboutOther: true })}>{t('report.whoOther')}</button>
                </div>
              </fieldset>
            </>
          )}

          {d.step === 2 && (
            <>
              <div role="tablist" aria-label={t('report.howTell')} className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
                {(['type', 'voice', 'dictate'] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={d.method === m} onClick={() => update({ method: m })}
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-[.95rem] font-semibold ${d.method === m ? 'bg-surface text-primary shadow' : 'text-text'}`}>
                    <Icon name={m === 'type' ? 'keyboard' : m === 'voice' ? 'mic' : 'wave'} size={18} />
                    {t(`report.method.${m}`)}
                  </button>
                ))}
              </div>
              {d.method === 'voice' && <VoiceRecorder onSave={addVoice} />}
              {d.method === 'dictate' && (
                <Dictation onUseVoiceNote={() => update({ method: 'voice' })}
                  onText={(txt) => setD((old) => { if (!old) return old; setTouched(true); return { ...old, description: old.description ? `${old.description} ${txt}` : txt }; })} />
              )}
              {d.voice.length > 0 && (
                <ul className="flex flex-col gap-2" aria-label={t('report.voiceNotes')}>
                  {d.voice.map((v) => (
                    <li key={v.fileId} className="card flex flex-wrap items-center gap-3 !py-3">
                      <span className="icon-tile sm"><Icon name="mic" size={18} /></span>
                      <span className="font-semibold">{v.label}</span>
                      <span className="text-sm text-muted">{formatDuration(v.seconds ?? 0)}</span>
                      <span className="ms-auto flex items-center gap-2">
                        {previews[v.fileId] ? <audio controls src={previews[v.fileId]} className="h-10 max-w-[13rem]" /> : (
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => ensurePreview(v)}><Icon name="play" size={16} />{t('report.listen')}</button>
                        )}
                        <button type="button" className="btn btn-quiet btn-sm !px-3" onClick={() => removeRef('voice', v)} aria-label={t('report.remove', { name: v.label })}><Icon name="trash" size={18} /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="field">
                <label htmlFor="desc" className="label">{d.method === 'type' ? t('report.descLabel') : t('report.descOptional')}</label>
                <textarea id="desc" className="input min-h-44 py-3" value={d.description} onChange={(e) => update({ description: e.target.value })}
                  placeholder={t('report.descPlaceholder')} maxLength={20000} />
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-bold">{t('report.when')} <span className="font-normal text-muted">{t('report.roughly')}</span></legend>
                <div className="flex flex-wrap gap-2">
                  {(['week', 'month', 'earlier', 'unsure'] as When[]).map((w) => (
                    <button key={w} type="button" className="pill" aria-pressed={d.when === w} onClick={() => update({ when: w })}>{t(`report.whenOpt.${w}`)}</button>
                  ))}
                </div>
              </fieldset>
              <TextField label={t('report.where')} hint={t('report.whereHint')} value={d.where} onChange={(e) => update({ where: e.target.value })} maxLength={300} />
            </>
          )}

          {d.step === 3 && (
            <>
              <div className="card-soft flex items-start gap-3 text-[.95rem]">
                <span className="icon-tile sm !bg-surface"><Icon name="map" size={18} /></span>
                <span data-read>{t('evidence.cleanNote')}</span>
              </div>
              <label className={`btn btn-primary w-full cursor-pointer ${d.files.length >= MAX_FILES ? 'pointer-events-none opacity-50' : ''}`}>
                <Icon name="upload" size={20} />{t('evidence.add')}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </label>
              <p className="text-sm text-muted">{t('evidence.limits', { n: MAX_FILES })}</p>
              {processing > 0 && <p role="status" className="text-sm"><Busy label={t('evidence.cleaning')} /></p>}
              {d.files.length > 0 && (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {d.files.map((f) => (
                    <li key={f.fileId} className="card flex flex-col gap-2 !p-3">
                      <FileThumb kind={f.kind} url={previews[f.fileId]} onNeed={() => ensurePreview(f)} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{f.label}</span>
                          <span className="flex items-center gap-1 text-xs text-muted"><Icon name="check" size={12} />{t('evidence.cleaned')} · {formatSize(f.size)}</span>
                        </span>
                        <button type="button" className="btn btn-quiet btn-sm shrink-0 !px-2.5" onClick={() => removeRef('files', f)} aria-label={t('report.remove', { name: f.label })}><Icon name="trash" size={16} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {d.files.length === 0 && <p className="text-center text-muted">{t('evidence.none')}</p>}
            </>
          )}

          {d.step === 4 && (
            <>
              <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('report.q.4')}>
                {(['ANONYMOUS', 'CONFIDENTIAL', 'NAMED'] as Mode[]).map((m) => (
                  <Option key={m} on={d.mode === m} onClick={() => update({ mode: m })} icon={m === 'ANONYMOUS' ? 'eye' : m === 'CONFIDENTIAL' ? 'lock' : 'users'}
                    title={t(`mode.${m}.title`)} body={t(`mode.${m}.body`)} />
                ))}
              </div>
              {d.mode && d.mode !== 'ANONYMOUS' && (
                <div className="card flex flex-col gap-4">
                  <TextField label={t('report.yourName')} value={d.name} onChange={(e) => update({ name: e.target.value })} autoComplete="name" maxLength={120} />
                  <TextField label={t('report.contact')} hint={t('report.contactHint')} value={d.contact} onChange={(e) => update({ contact: e.target.value })} maxLength={200} />
                  <p className="text-sm text-muted">{t(`mode.${d.mode}.who`)}</p>
                </div>
              )}
              {d.mode === 'ANONYMOUS' && <div className="card-soft text-[.95rem]">{t('mode.ANONYMOUS.limits')}</div>}
            </>
          )}

          {d.step === 5 && (
            <>
              <ul className="flex flex-col gap-2">
                {members.map((m) => {
                  const kept = d.excluded.includes(m.id);
                  return (
                    <li key={m.id}>
                      <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-surface px-4 ${kept ? 'border-accent' : 'border-line'}`}>
                        <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={kept}
                          onChange={() => update({ excluded: kept ? d.excluded.filter((x) => x !== m.id) : [...d.excluded, m.id] })} />
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{m.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                        <span className="flex-1 font-semibold">{m.displayName}</span>
                        {kept && <span className="badge badge-inq">{t('exclude.keptAway')}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {remaining < 2 ? (
                <div role="alert" className="rounded-2xl border-2 border-accent bg-accent-soft p-3.5">{t('exclude.tooMany')}</div>
              ) : (
                <p className="text-sm text-muted">{t('exclude.note')}</p>
              )}
            </>
          )}

          {d.step === 6 && category && (
            <>
              <div className="card !py-1">
                <Row label={t('report.steps.1')} value={`${t(`categories.${category.name}`, { defaultValue: category.name })}${d.aboutOther ? ` · ${t('review.witness')}` : ''}`} onEdit={() => goTo(1)} />
                <Row label={t('report.steps.2')} value={[d.description.trim() ? t('review.words', { n: d.description.trim().split(/\s+/).length }) : '', d.voice.length ? t('review.voice', { count: d.voice.length }) : ''].filter(Boolean).join(' · ')} onEdit={() => goTo(2)} />
                <Row label={t('report.steps.3')} value={d.files.length ? t('review.files', { count: d.files.length }) : t('review.noFiles')} onEdit={() => goTo(3)} />
                <Row label={t('report.steps.4')} value={t(`mode.${d.mode}.title`)} onEdit={() => goTo(4)} />
                <Row label={t('report.steps.5')} value={d.excluded.length ? t('review.excluded', { count: d.excluded.length }) : t('review.noneExcluded')} onEdit={() => goTo(5)} />
              </div>
              <div className="card-soft flex items-start gap-3 text-[.95rem]">
                <span className="icon-tile sm !bg-surface"><Icon name="lock" size={18} /></span>
                <span data-read>{t('review.lockNote')}</span>
              </div>
            </>
          )}

          <FormError message={error} />

          <div className="sticky bottom-0 z-10 -mx-4 mt-2 grid grid-cols-[1fr_2fr] gap-3 border-t border-line bg-bg px-4 py-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            {d.step > 1 ? (
              <button type="button" className="btn btn-outline" onClick={() => goTo(d.step - 1)} disabled={!!sending}><span className="rtl:rotate-180"><Icon name="back" size={18} /></span>{t('common.back')}</button>
            ) : (
              <Link to="/space" className="btn btn-outline whitespace-nowrap !px-3">{t('report.later')}</Link>
            )}
            {d.step < STEPS ? (
              <button type="button" className="btn btn-primary" onClick={next}>{t('common.continue')}<span className="rtl:rotate-180"><Icon name="arrow" size={18} /></span></button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={send} disabled={!!sending}>{sending ? <Busy label={sending} /> : <><Icon name="send" size={18} />{t('review.send')}</>}</button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 lg:hidden"><SaveBadge state={saveState} /></div>
          {(touched || d.step > 1 || d.description || d.categoryId) && (
            <button type="button" onClick={startOver} className="self-center text-sm text-muted underline">{t('report.startOver')}</button>
          )}
        </div>
      </div>
    </Layout>
  );
}

function SaveBadge({ state }: { state: string }) {
  const { t } = useTranslation();
  if (state === 'idle') return <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" size={14} />{t('report.save.idle')}</p>;
  return (
    <p className="mt-4 flex items-center gap-1.5 text-xs text-muted" role="status">
      <Icon name={state === 'error' ? 'alert' : 'check'} size={14} />
      {t(`report.save.${state}`)}
    </p>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-center gap-3 text-end">
        <b>{value || '—'}</b>
        <button type="button" onClick={onEdit} className="text-sm text-primary underline" aria-label={`${t('review.edit')}: ${label}`}>{t('review.edit')}</button>
      </span>
    </div>
  );
}

function Option({ on, onClick, icon, title, body }: { on: boolean; onClick: () => void; icon: string; title: string; body: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`flex items-start gap-4 rounded-[18px] border-2 bg-surface p-4 text-start ${on ? 'border-primary ring-4 ring-primary-soft' : 'border-line hover:border-input'}`}>
      <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 ${on ? 'border-[7px] border-primary' : 'border-input'}`} aria-hidden="true" />
      <span className="icon-tile sm"><Icon name={icon} size={18} /></span>
      <span className="flex flex-col gap-1">
        <b>{title}</b>
        <span className="text-[.95rem] text-muted">{body}</span>
      </span>
    </button>
  );
}
