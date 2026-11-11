import { useTranslation } from 'react-i18next';

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('header.language')}</span>
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="min-h-11 rounded-lg border border-line bg-surface px-3 text-text"
      >
        <option value="en">English</option>
        <option value="ur" lang="ur">اردو</option>
      </select>
    </label>
  );
}
