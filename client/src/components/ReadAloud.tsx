import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

// Voice A: reads the page's main text aloud with the device's own voices (nothing is sent anywhere).
// Never starts by itself; highlights the sentence block being read; stops when leaving the page.
export function ReadAloud({ scope = 'main' }: { scope?: string }) {
  const { t, i18n } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  const current = useRef<HTMLElement | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const clearHighlight = () => {
    current.current?.classList.remove('reading');
    current.current = null;
  };
  const stop = () => {
    window.speechSynthesis?.cancel();
    clearHighlight();
    setPlaying(false);
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (playing) stop(); }, [i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) return null;

  const start = () => {
    setNotice('');
    const root = document.querySelector(scope) ?? document.body;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-read]')).filter((el) => el.innerText.trim());
    if (!blocks.length) return;
    const lang = i18n.language === 'ur' ? 'ur' : 'en';
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang));
    if (lang === 'ur' && !voice) {
      setNotice(t('readAloud.noUrdu'));
      return;
    }
    window.speechSynthesis.cancel();
    setPlaying(true);
    blocks.forEach((el, i) => {
      const u = new SpeechSynthesisUtterance(el.innerText);
      u.lang = lang === 'ur' ? 'ur-PK' : 'en-US';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => {
        clearHighlight();
        el.classList.add('reading');
        current.current = el;
      };
      if (i === blocks.length - 1) u.onend = () => { clearHighlight(); setPlaying(false); };
      u.onerror = () => { clearHighlight(); setPlaying(false); };
      window.speechSynthesis.speak(u);
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={playing ? stop : start} aria-pressed={playing}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 ${playing ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface-2 text-text'}`}>
        <span className={playing ? '' : 'text-primary'}><Icon name={playing ? 'stop' : 'speaker'} size={18} /></span>
        {playing ? t('readAloud.stop') : t('readAloud.start')}
      </button>
      <p role="status" className="text-sm text-muted">{notice}</p>
    </div>
  );
}
