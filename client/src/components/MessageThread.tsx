import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Busy } from './Field';
import { VoiceRecorder } from './VoiceRecorder';
import { formatDuration } from '../lib/media';
import type { MessagePayload } from '../lib/messages';

export interface ThreadItem { id: string; mine: boolean; who: string; at: string; payload: MessagePayload }

const fmt = (d: string, locale: string) => new Date(d).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function VoiceBubble({ id, seconds, load, mine, labels }: { id: string; seconds: number; load: (id: string) => Promise<string>; mine: boolean; labels: { play: string } }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  if (url) return <audio controls src={url} className="mt-1 h-10 w-64 max-w-full" />;
  return (
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { setUrl(await load(id)); } finally { setBusy(false); } }}
      className={`mt-1 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold ${mine ? 'bg-white/15' : 'bg-surface'}`}>
      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="play" size={16} />}
      <Icon name="mic" size={16} />{labels.play} · {formatDuration(seconds)}
    </button>
  );
}

export function MessageThread({ items, loadVoice, locale = 'en-US', empty, playLabel = 'Play voice note' }: {
  items: ThreadItem[]; loadVoice: (id: string) => Promise<string>; locale?: string; empty: string; playLabel?: string;
}) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="flex flex-col gap-3" aria-live="polite">
      {items.map((m) => (
        <li key={m.id} className={`flex max-w-[85%] flex-col ${m.mine ? 'self-end items-end' : 'self-start items-start'}`}>
          <span className="mb-1 text-xs text-muted">{m.who} · {fmt(m.at, locale)}</span>
          <div className={`rounded-2xl px-4 py-2.5 ${m.mine ? 'rounded-ee-md bg-primary text-on-primary' : 'rounded-es-md bg-surface-2 text-text'}`}>
            {m.payload.text && <p className="whitespace-pre-wrap">{m.payload.text}</p>}
            {m.payload.voice && <VoiceBubble id={m.payload.voice.id} seconds={m.payload.voice.seconds} load={loadVoice} mine={m.mine} labels={{ play: playLabel }} />}
            {!m.payload.text && !m.payload.voice && <p className="italic opacity-75">(This message could not be opened.)</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Text + optional voice note. Templates (committee only) fill the box so they can be edited first. */
export function Composer({ onSend, labels, templates, disabled }: {
  onSend: (text: string, voice?: { bytes: Uint8Array; mime: string; seconds: number }) => Promise<void>;
  labels: { placeholder: string; send: string; voice: string; cancelVoice: string; sending: string; templates?: string; voiceReady: string };
  templates?: { id: number; title: string; body: string }[];
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<{ bytes: Uint8Array; mime: string; seconds: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (voice) setRecording(false); }, [voice]);
  const send = async () => {
    if ((!text.trim() && !voice) || busy) return;
    setBusy(true);
    try {
      await onSend(text.trim(), voice ?? undefined);
      setText('');
      setVoice(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {templates && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{labels.templates}</span>
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className="pill !min-h-9 text-sm" onClick={() => setText(tpl.body)}>{tpl.title}</button>
          ))}
        </div>
      )}
      {recording && <VoiceRecorder onSave={(bytes, mime, seconds) => setVoice({ bytes, mime, seconds })} />}
      {voice && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-primary-soft px-3 py-2 text-sm">
          <span className="flex items-center gap-2"><Icon name="mic" size={16} />{labels.voiceReady} · {formatDuration(voice.seconds)}</span>
          <button type="button" className="text-primary underline" onClick={() => setVoice(null)}>{labels.cancelVoice}</button>
        </div>
      )}
      <label className="sr-only" htmlFor="composer">{labels.placeholder}</label>
      <textarea id="composer" className="input min-h-24 py-2.5" placeholder={labels.placeholder} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} disabled={disabled}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
      <div className="flex flex-wrap justify-end gap-2">
        {!voice && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRecording((r) => !r)} disabled={disabled} aria-pressed={recording}>
            <Icon name="mic" size={16} />{recording ? labels.cancelVoice : labels.voice}
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={disabled || busy || (!text.trim() && !voice)}>
          {busy ? <Busy label={labels.sending} /> : <><Icon name="send" size={16} />{labels.send}</>}
        </button>
      </div>
    </div>
  );
}
