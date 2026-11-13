import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { ReadAloud } from '../../components/ReadAloud';
import { Busy, FormError } from '../../components/Field';
import { useReporter } from '../../auth/ReporterAuth';
import { loadVault, markCaseRead } from '../../lib/vault';
import { MessageThread, Composer, type ThreadItem } from '../../components/MessageThread';
import { decryptMessage, encryptMessage } from '../../lib/messages';
import { encryptBytes } from '../../lib/reportCrypto';
import { postBytes } from '../../lib/binary';
import { api } from '../../lib/api';
import { invalidateUnread } from '../../lib/unread';
import { cleanFile, kindOf, MAX_FILE_BYTES } from '../../lib/media';
import { errorText } from '../../lib/errors';
import { formatDuration, formatSize } from '../../lib/media';
import { fetchAttachment, fetchCase, openCase, STATUS_BADGE, type CaseMeta, type ReportContent, type Status } from './caseData';

const FLOW: Status[] = ['RECEIVED', 'UNDER_REVIEW', 'INQUIRY', 'CLOSED'];

export default function CaseView() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { session } = useReporter();
  const [meta, setMeta] = useState<CaseMeta | null>(null);
  const [report, setReport] = useState<ReportContent | null>(null);
  const [keys, setKeys] = useState<{ authKey: string; contentKey: Uint8Array } | null>(null);
  const [error, setError] = useState('');
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!session || !id) return;
    const v = (await loadVault(session.masterKey)).cases.find((c) => c.id === id);
    if (!v) throw new Error('missing');
    const { meta: m, ck } = await fetchCase(session.masterKey, v);
    const { report: r, contentKey } = await openCase(m, ck);
    const items: ThreadItem[] = [];
    for (const msg of m.messages) {
      items.push({ id: msg.id, mine: msg.from === 'me', who: msg.from === 'me' ? t('messages.you') : t('messages.committee'), at: msg.createdAt, payload: await decryptMessage(contentKey, msg) });
    }
    setThread(items);
    setMeta(m);
    setReport(r);
    setKeys({ authKey: ck.authKey, contentKey });
    // Reading the case clears its "new message" badge (stored encrypted in the private vault).
    markCaseRead(session.masterKey, id).then(invalidateUnread).catch(() => {});
  }, [session, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load().catch((e) => setError((e as Error).message === 'missing' ? t('caseView.notFound') : errorText(e, t)));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (text: string, voice?: { bytes: Uint8Array; mime: string; seconds: number }) => {
    if (!keys || !meta) return;
    setError('');
    try {
      let v: { id: string; seconds: number } | undefined;
      if (voice) {
        const r = await postBytes(`/reports/${meta.id}/attachments`, await encryptBytes(keys.contentKey, voice.bytes),
          { 'X-Case-Auth': keys.authKey, 'X-Attachment-Kind': 'voice', 'X-Attachment-Type': voice.mime, 'X-Attachment-Purpose': 'message' });
        v = { id: r.id, seconds: voice.seconds };
      }
      await api(`/reporter/cases/${meta.id}/messages`, { headers: { 'X-Case-Auth': keys.authKey }, body: await encryptMessage(keys.contentKey, { text, voice: v }) });
      await load();
    } catch (e) {
      setError(errorText(e, t));
      throw e;
    }
  };

  const loadVoice = async (aid: string) => {
    const bytes = await fetchAttachment(meta!.id, aid, keys!.authKey, keys!.contentKey);
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/webm' }));
  };

  const addEvidence = async (list: FileList | null) => {
    if (!list || !keys || !meta) return;
    setAdding(true);
    setError('');
    try {
      for (const file of Array.from(list).slice(0, 10)) {
        if (!kindOf(file)) { setError(t('evidence.badType')); continue; }
        if (file.size > MAX_FILE_BYTES) { setError(t('evidence.tooBig')); continue; }
        const clean = await cleanFile(file);
        await postBytes(`/reports/${meta.id}/attachments`, await encryptBytes(keys.contentKey, clean.bytes),
          { 'X-Case-Auth': keys.authKey, 'X-Attachment-Kind': clean.kind, 'X-Attachment-Type': clean.mime, 'X-Attachment-Purpose': 'evidence' });
      }
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setAdding(false);
    }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString(i18n.language === 'ur' ? 'ur-PK' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const stage = meta ? (meta.status === 'PENDING_CLOSURE' ? 2 : FLOW.indexOf(meta.status)) : 0;
  const reachedAt = (s: Status) => meta?.history.find((h) => h.to === s)?.at;
  const locale = i18n.language === 'ur' ? 'ur-PK' : 'en-US';

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <Link to="/cases" className="inline-flex min-h-11 items-center gap-1 self-start text-sm no-underline"><span className="rtl:rotate-180"><Icon name="back" size={18} /></span>{t('nav.cases')}</Link>
        <FormError message={error} />
        {!meta || !report ? (
          !error && <p className="text-muted"><Busy label={t('caseView.unlocking')} /></p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-mono text-2xl font-bold lg:text-3xl" dir="ltr">{meta.id}</h1>
                <p className="text-sm text-muted">{t(`categories.${meta.category}`, { defaultValue: meta.category })} · {t(`mode.${meta.mode}.title`)} · {t('cases.sentOn', { date: fmt(meta.submittedAt) })}</p>
              </div>
              <span className={`badge ${STATUS_BADGE[meta.status]} !text-sm`}><span className="h-2 w-2 rounded-full bg-current" />{t(`status.${meta.status}`)}</span>
            </div>
            <p data-read>{t(`caseView.statusLine.${meta.status}`)}</p>
            <ReadAloud />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <section className="card flex flex-col gap-4 lg:p-6" aria-labelledby="yr-h">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="yr-h" className="text-lg font-bold">{t('caseView.yourReport')}</h2>
                  <span className="badge badge-clo"><Icon name="lock" size={13} />{t('caseView.onlyReaders')}</span>
                </div>
                {report.description && <p className="whitespace-pre-wrap leading-relaxed">{report.description}</p>}
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="card-soft !p-3"><dt className="text-xs text-muted">{t('report.when')}</dt><dd className="font-semibold">{t(`report.whenOpt.${report.when}`)}</dd></div>
                  {report.where && <div className="card-soft !p-3"><dt className="text-xs text-muted">{t('caseView.where')}</dt><dd className="font-semibold">{report.where}</dd></div>}
                  <div className="card-soft !p-3"><dt className="text-xs text-muted">{t('caseView.about')}</dt><dd className="font-semibold">{report.aboutOther ? t('report.whoOther') : t('report.whoMe')}</dd></div>
                </dl>
                {meta.attachments.length > 0 && keys && (
                  <div className="flex flex-col gap-3">
                    <h3 className="font-bold">{t('caseView.files')}</h3>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {meta.attachments.map((a, i) => (
                        <li key={a.id}><Attachment caseId={meta.id} a={a} n={i + 1} authKey={keys.authKey} contentKey={keys.contentKey} seconds={report.voiceNotes[meta.attachments.filter((x, j) => x.kind === 'voice' && j < i).length]?.seconds} /></li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted" dir="ltr">{t('sent.fingerprint')}: <span className="font-mono">{meta.fingerprint.toUpperCase().match(/.{4}/g)!.slice(0, 4).join(' ')} …</span></p>
              </section>
              <aside className="flex flex-col gap-5">
                <section className="card flex flex-col gap-3" aria-labelledby="pr-h">
                  <h2 id="pr-h" className="font-bold">{t('caseView.progress')}</h2>
                  <ol className="flex flex-col">
                    {FLOW.map((s, i) => (
                      <li key={s} className="flex gap-3">
                        <span className="flex flex-col items-center">
                          <span className={`mt-1 h-5 w-5 rounded-full border-[3px] ${i <= stage ? 'border-primary bg-primary' : 'border-input bg-surface'}`} />
                          {i < FLOW.length - 1 && <span className={`w-0.5 flex-1 ${i < stage ? 'bg-primary' : 'bg-line'}`} style={{ minHeight: '1.75rem' }} />}
                        </span>
                        <span className="pb-4">
                          <span className={i <= stage ? 'font-semibold' : 'text-muted'}>{t(`status.${s}`)}</span>
                          {i === 0 && <span className="block text-xs text-muted">{fmt(meta.submittedAt)}</span>}
                          {i === 0 && meta.firstViewedAt && <span className="block text-xs text-muted">{t('caseView.firstRead', { date: fmt(meta.firstViewedAt) })}</span>}
                          {i > 0 && i <= stage && reachedAt(s) && <span className="block text-xs text-muted">{fmt(reachedAt(s)!)}</span>}
                          {i === stage && i > 0 && <span className="ms-2 badge badge-rev">{t('caseView.now')}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="card flex flex-col gap-3">
                  <h2 className="font-bold">{t('caseView.addMore')}</h2>
                  <p className="text-sm text-muted">{t('caseView.addMoreHint')}</p>
                  <label className={`btn btn-outline btn-sm cursor-pointer ${adding ? 'pointer-events-none opacity-60' : ''}`}>
                    {adding ? <Busy label={t('evidence.cleaning')} /> : <><Icon name="upload" size={16} />{t('evidence.add')}</>}
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => { addEvidence(e.target.files); e.target.value = ''; }} />
                  </label>
                </section>
              </aside>
            </div>
            <section className="card flex flex-col gap-4 lg:p-6" aria-labelledby="msg-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="msg-h" className="text-lg font-bold">{t('caseView.messagesTitle')}</h2>
                <span className="badge badge-clo"><Icon name="lock" size={13} />{t('messages.locked')}</span>
              </div>
              <MessageThread items={thread} loadVoice={loadVoice} locale={locale} empty={t('caseView.messagesSoon')} playLabel={t('messages.play')} />
              {meta.status === 'CLOSED' ? <p className="text-sm text-muted">{t('messages.closed')}</p> : (
                <Composer onSend={send} labels={{ placeholder: t('messages.placeholder'), send: t('messages.send'), voice: t('messages.voice'), cancelVoice: t('messages.cancelVoice'), sending: t('messages.sending'), voiceReady: t('messages.voiceReady') }} />
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function Attachment({ caseId, a, n, authKey, contentKey, seconds }: { caseId: string; a: CaseMeta['attachments'][number]; n: number; authKey: string; contentKey: Uint8Array; seconds?: number }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const load = async () => {
    setBusy(true);
    try {
      const bytes = await fetchAttachment(caseId, a.id, authKey, contentKey);
      setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: a.mimeType })));
    } finally {
      setBusy(false);
    }
  };
  const label = a.kind === 'voice' ? t('caseView.voiceN', { n }) : a.kind === 'image' ? t('evidence.photoN', { n }) : t('evidence.docN', { n });
  return (
    <div className="card-soft flex flex-col gap-2 !p-3">
      <span className="flex items-center gap-2 font-semibold"><Icon name={a.kind === 'voice' ? 'mic' : a.kind === 'image' ? 'image' : 'file'} size={18} />{label}
        <span className="text-xs font-normal text-muted">{a.kind === 'voice' && seconds ? formatDuration(seconds) : formatSize(a.size)}</span></span>
      {!url ? (
        <button type="button" className="btn btn-quiet btn-sm self-start !bg-surface" onClick={load} disabled={busy}>{busy ? <Busy label={t('caseView.opening')} /> : <><Icon name="lock" size={16} />{t('caseView.open')}</>}</button>
      ) : a.kind === 'voice' ? (
        <audio controls src={url} className="w-full" />
      ) : a.kind === 'image' ? (
        <button type="button" onClick={() => setRevealed((r) => !r)} className="relative overflow-hidden rounded-xl" aria-label={revealed ? t('evidence.hide') : t('evidence.reveal')}>
          <img src={url} alt="" className={`max-h-64 w-full object-cover ${revealed ? '' : 'blur-xl'}`} />
          {!revealed && <span className="absolute inset-x-2 bottom-2 rounded-full bg-surface px-2 py-1 text-xs font-bold">{t('evidence.reveal')}</span>}
        </button>
      ) : (
        <a href={url} download={`${label}.pdf`} className="btn btn-quiet btn-sm self-start !bg-surface"><Icon name="file" size={16} />{t('caseView.download')}</a>
      )}
    </div>
  );
}
