import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Shown to a reporter when another report names the same person. It never says who, or how many. */
export function NotAloneBanner() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex w-full items-start gap-3 rounded-2xl border-2 border-primary bg-primary-soft p-4 text-start">
      <span className="icon-tile sm !bg-surface"><Icon name="users" size={18} /></span>
      <span className="flex flex-col gap-1">
        <b data-read>{t('notAlone.bannerTitle')}</b>
        <span data-read className="text-[.95rem]">{t('notAlone.bannerBody')}</span>
      </span>
    </div>
  );
}
