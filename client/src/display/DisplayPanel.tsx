import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { useDisplay, type DisplayPrefs, type Spacing, type Theme } from './DisplayProvider';

const SIZES: DisplayPrefs['textScale'][] = [1, 1.25, 1.5, 1.75];
const SPACINGS: Spacing[] = ['normal', 'relaxed', 'extra'];
const THEMES: { id: Theme; swatch: string }[] = [
  { id: 'light', swatch: '#FBF8F3' },
  { id: 'dark', swatch: '#11191B' },
  { id: 'eyecare', swatch: '#F3EAD3' },
];

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-sm text-muted">{hint}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

// "Display and reading" panel: text size, spacing, colours, motion and a discreet tab name.
export function DisplayPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { prefs, update } = useDisplay();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="display-title" onClose={onClose} onCancel={onClose}>
      <div className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <h2 id="display-title" className="text-xl font-bold">{t('display.title')}</h2>
          <button type="button" className="btn btn-quiet btn-sm !px-3" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{t('display.colours')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((th) => (
              <button key={th.id} type="button" aria-pressed={prefs.theme === th.id} onClick={() => update({ theme: th.id })}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-surface p-2.5 font-semibold ${prefs.theme === th.id ? 'border-primary ring-4 ring-primary-soft' : 'border-line'}`}>
                <span className="h-7 w-full rounded-lg border border-line" style={{ background: th.swatch }} />
                {t(`display.theme.${th.id}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{t('display.textSize')}</legend>
          <div className="grid grid-cols-4 gap-2">
            {SIZES.map((s, i) => (
              <button key={s} type="button" className="pill justify-center" aria-pressed={prefs.textScale === s}
                aria-label={`${Math.round(s * 100)}%`} onClick={() => update({ textScale: s })}>
                <span aria-hidden="true" style={{ fontSize: `${0.85 + i * 0.2}rem` }}>A</span>
              </button>
            ))}
          </div>
          <span className="text-sm text-muted">{Math.round(prefs.textScale * 100)}%</span>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{t('display.lineSpacing')}</legend>
          <div className="flex flex-wrap gap-2">
            {SPACINGS.map((s) => (
              <button key={s} type="button" className="pill" aria-pressed={prefs.lineSpacing === s} onClick={() => update({ lineSpacing: s })}>
                {t(`display.spacing.${s}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <Toggle checked={prefs.wideLetters} onChange={(v) => update({ wideLetters: v })} label={t('display.wideLetters')} hint={t('display.wideLettersHint')} />


        <Toggle checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} label={t('display.reduceMotion')} />
        <Toggle checked={prefs.discreetTab} onChange={(v) => update({ discreetTab: v })} label={t('display.discreet')} hint={t('display.discreetHint')} />

        <button type="button" className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>
      </div>
    </dialog>
  );
}
