import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// FR-3: one action clears the page and the in-tab draft, then opens a neutral site.
// location.replace() means the Back button does not return here.
export function quickExit() {
  try {
    window.sessionStorage.clear();
  } catch {
    /* storage may be blocked */
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
    <button
      type="button"
      onClick={quickExit}
      title={t('quickExit.hint')}
      aria-label={`${t('quickExit.label')}. ${t('quickExit.hint')}`}
      className="min-h-11 rounded-lg bg-danger px-4 font-semibold text-on-danger shadow-sm hover:opacity-90"
    >
      {t('quickExit.label')}
    </button>
  );
}
