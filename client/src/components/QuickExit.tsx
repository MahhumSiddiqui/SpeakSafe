import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

// FR-3: one action stops speech, clears the in-tab session and draft, and opens a neutral site.
// location.replace() means the Back button does not return here.
export function quickExit() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.clear();
  } catch {
    /* storage may be blocked */
  }
  // Best effort: end the server session too (the page leaves immediately either way).
  try {
    navigator.sendBeacon?.('/api/reporter/logout');
  } catch {
    /* ignore */
  }
  document.title = 'Google';
  document.body.innerHTML = '';
  window.location.replace('https://www.google.com/');
}

export function QuickExit() {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && e.shiftKey) quickExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button type="button" onClick={quickExit} title={t('quickExit.hint')} aria-label={`${t('quickExit.label')}. ${t('quickExit.hint')}`}
      className="btn btn-accent btn-sm whitespace-nowrap !px-3">
      <Icon name="x" size={16} stroke={2.6} />
      {t('quickExit.label')}
    </button>
  );
}
