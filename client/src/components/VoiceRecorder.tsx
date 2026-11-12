import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { formatDuration } from '../lib/media';

// Voice B: records a voice note in the browser. Audio never leaves the device unencrypted.
const MAX_SECONDS = 5 * 60;
const BARS = 28;

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

export function VoiceRecorder({ onSave }: { onSave: (bytes: Uint8Array, mime: string, seconds: number) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'denied' | 'unsupported'>(
    typeof MediaRecorder === 'undefined' || !navigator.mediaDevices ? 'unsupported' : 'idle',
  );
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(BARS).fill(4));
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const raf = useRef<number | undefined>(undefined);
  const ctx = useRef<AudioContext | null>(null);
  const secsRef = useRef(0);

  const cleanup = () => {
    window.clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    ctx.current?.close().catch(() => {});
    stream.current = null;
    ctx.current = null;
  };
  useEffect(() => () => cleanup(), []);

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        const type = (r.mimeType || mime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks.current, { type });
        cleanup();
        setState('idle');
        if (blob.size) onSave(new Uint8Array(await blob.arrayBuffer()), type, secsRef.current);
        setSeconds(0);
        secsRef.current = 0;
        setLevels(Array(BARS).fill(4));
      };
      r.start(1000);
      rec.current = r;
      // Live level meter so people can see the recording is working.
      const ac = new AudioContext();
      ctx.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 256;
      ac.createMediaStreamSource(s).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const draw = () => {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevels((l) => [...l.slice(1), 4 + Math.min(32, peak * 0.6)]);
        raf.current = requestAnimationFrame(draw);
      };
      draw();
      timer.current = window.setInterval(() => {
        if (rec.current?.state !== 'recording') return;
        secsRef.current += 1;
        setSeconds(secsRef.current);
        if (secsRef.current >= MAX_SECONDS) rec.current?.stop();
      }, 1000);
      setState('recording');
    } catch {
      cleanup();
      setState('denied');
    }
  };

  const pause = () => {
    if (rec.current?.state === 'recording') {
      rec.current.pause();
      setState('paused');
    } else if (rec.current?.state === 'paused') {
      rec.current.resume();
      setState('recording');
    }
  };
  const stop = () => rec.current?.stop();
  const discard = () => {
    if (!rec.current) return;
    rec.current.onstop = () => {
      cleanup();
      setState('idle');
      setSeconds(0);
      secsRef.current = 0;
      setLevels(Array(BARS).fill(4));
    };
    rec.current.stop();
  };

  if (state === 'unsupported') return <p className="card-soft text-sm">{t('voice.unsupported')}</p>;

  return (
    <div className="card flex flex-col items-center gap-4 text-center">
      {state === 'denied' && <p role="alert" className="text-sm font-semibold text-accent">{t('voice.denied')}</p>}
      {state === 'idle' || state === 'denied' ? (
        <>
          <button type="button" onClick={start} className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg" aria-label={t('voice.start')}>
            <Icon name="mic" size={32} />
          </button>
          <span className="font-semibold">{t('voice.tapToRecord')}</span>
          <span className="text-sm text-muted">{t('voice.limit')}</span>
        </>
      ) : (
        <>
          <span className="badge badge-inq" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-current" />
            {state === 'paused' ? t('voice.paused') : t('voice.recording')} · {formatDuration(seconds)}
          </span>
          <div className="flex h-10 items-center gap-[3px]" aria-hidden="true">
            {levels.map((h, i) => <i key={i} className="block w-1 rounded-full bg-primary" style={{ height: `${h}px` }} />)}
          </div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={discard} className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface" aria-label={t('voice.discard')} title={t('voice.discard')}>
              <Icon name="trash" size={22} />
            </button>
            <button type="button" onClick={stop} className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-on-accent" aria-label={t('voice.stop')}>
              <Icon name="stop" size={30} />
            </button>
            <button type="button" onClick={pause} className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface" aria-label={state === 'paused' ? t('voice.resume') : t('voice.pause')}>
              <Icon name={state === 'paused' ? 'mic' : 'pause'} size={22} />
            </button>
          </div>
          <span className="text-sm text-muted">{t('voice.stopHint')}</span>
        </>
      )}
      <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" size={14} />{t('voice.locked')}</span>
    </div>
  );
}
