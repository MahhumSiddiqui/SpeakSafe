import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

// Emergency numbers (Pakistan). Verified November 12, 2026: Police 15, Rescue 1122,
// Ministry of Human Rights toll-free helpline 1099 (mohr.gov.pk). Calls go from the person's own phone.
const NUMBERS = [
  { key: 'police', tel: '15' },
  { key: 'rescue', tel: '1122' },
  { key: 'humanRights', tel: '1099' },
] as const;

export function HelpNow() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="help-h" className="flex flex-col gap-2.5 rounded-[18px] border-2 border-accent bg-accent-soft p-4">
      <div className="flex items-center gap-3">
        <span className="icon-tile sm accent !bg-surface"><Icon name="phone" size={18} /></span>
        <h2 id="help-h" data-read className="font-bold text-accent">{t('help.title')}</h2>
      </div>
      <p data-read className="text-[.95rem]">{t('help.body')}</p>
      {NUMBERS.map((n) => (
        <a key={n.key} href={`tel:${n.tel}`} className="flex min-h-12 items-center justify-between rounded-xl bg-surface px-4 text-text no-underline">
          <span>{t(`help.${n.key}`)}</span>
          <span className="font-extrabold" dir="ltr">{n.tel}</span>
        </a>
      ))}
    </section>
  );
}
