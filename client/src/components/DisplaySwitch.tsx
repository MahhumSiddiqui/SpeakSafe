import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../theme/ThemeProvider';

// A labelled radio group: works with keyboard and screen readers, and shows the choice in text.
export function DisplaySwitch() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const options: Theme[] = ['light', 'dark', 'eyecare'];

  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{t('header.display')}</legend>
      {options.map((o) => (
        <label
          key={o}
          className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm ${
            theme === o ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-text hover:bg-surface-2'
          }`}
        >
          <input
            type="radio"
            name="display-mode"
            value={o}
            checked={theme === o}
            onChange={() => setTheme(o)}
            className="sr-only"
          />
          {t(`header.${o}`)}
        </label>
      ))}
    </fieldset>
  );
}
