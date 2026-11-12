import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

// Voice C: speech-to-text. OFF by default; the browser may send audio to Google or Microsoft,
// so the person must agree first, and we suggest a voice note as the more private choice.
type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const getSR = (): (new () => SR) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function Dictation({ onText, onUseVoiceNote }: { onText: (text: string) => void; onUseVoiceNote: () => void }) {
  const { t, i18n } = useTranslation();
  const [agreed, setAgreed] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<SR | null>(null);
  const SRClass = getSR();

  useEffect(() => () => rec.current?.stop(), []);

  if (!SRClass) return <p className="card-soft text-sm">{t('dictation.unsupported')}</p>;

  if (!agreed) {
    return (
      <div className="flex flex-col gap-3 rounded-[18px] border-2 border-primary p-4">
        <h3 className="font-bold">{t('dictation.consentTitle')}</h3>
        <p className="text-[.95rem]">{t('dictation.consentBody')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onUseVoiceNote}><Icon name="mic" size={18} />{t('dictation.useVoice')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAgreed(true)}>{t('dictation.agree')}</button>
        </div>
      </div>
    );
  }

  const start = () => {
    setError('');
    const r = new SRClass();
    r.lang = i18n.language === 'ur' ? 'ur-PK' : 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else mid += e.results[i][0].transcript;
      }
      if (fin) onText(fin.trim());
      setInterim(mid);
    };
    r.onend = () => { setListening(false); setInterim(''); };
    r.onerror = () => { setListening(false); setError(t('dictation.error')); };
    r.start();
    rec.current = r;
    setListening(true);
  };

  return (
    <div className="card flex flex-col items-center gap-3 text-center">
      <button type="button" onClick={listening ? () => rec.current?.stop() : start}
        className={`flex h-16 w-16 items-center justify-center rounded-full ${listening ? 'bg-accent text-on-accent' : 'bg-primary text-on-primary'}`}
        aria-label={listening ? t('dictation.stop') : t('dictation.start')}>
        <Icon name={listening ? 'stop' : 'mic'} size={26} />
      </button>
      <span className="font-semibold" aria-live="polite">{listening ? t('dictation.listening') : t('dictation.tap')}</span>
      {interim && <span className="text-sm text-muted italic">{interim}</span>}
      {error && <span role="alert" className="text-sm font-semibold text-accent">{error}</span>}
      <span className="text-xs text-muted">{t('dictation.appendHint')}</span>
    </div>
  );
}
