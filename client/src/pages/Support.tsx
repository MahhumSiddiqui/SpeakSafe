import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { ReadAloud } from '../components/ReadAloud';
import { useReporter } from '../auth/ReporterAuth';

// Support directory, filtered by type of concern. Every number below was checked on November 14, 2026
// against the provider's own page (or a primary source):
//   Police 15, Rescue 1122, Ministry of Human Rights 1099 (mohr.gov.pk)
//   FOSPAH 03444 367 367, info@fospah.gov.pk (fospah.gov.pk)
//   Punjab Commission on the Status of Women helpline 1043, 24/7 (pcsw.punjab.gov.pk)
//   Sindh Women Development Department helpline 1094 (UNFPA Pakistan brief, 2024)
//   Digital Rights Foundation Cyber Harassment Helpline 0800-39393, daily 9am to 5pm (digitalrightsfoundation.pk)
//   Madadgaar National Helpline 1098, run by LHRLA (Child Helpline International)
// Numbers change: re-check them before any real deployment.
type Filter = 'all' | 'danger' | 'harassment' | 'online' | 'workplace' | 'campus' | 'discrimination' | 'children';
const FILTERS: Filter[] = ['all', 'danger', 'harassment', 'online', 'workplace', 'campus', 'discrimination', 'children'];

interface Service {
  key: string;
  tags: Filter[];
  phones?: string[];
  email?: string;
  web?: string;
  urgent?: boolean;
}
const SERVICES: Service[] = [
  { key: 'emergency', tags: ['danger'], phones: ['15', '1122'], urgent: true },
  { key: 'campus', tags: ['campus', 'harassment', 'discrimination'] },
  { key: 'fospah', tags: ['workplace', 'harassment'], phones: ['03444 367 367'], email: 'info@fospah.gov.pk', web: 'https://fospah.gov.pk' },
  { key: 'pcsw', tags: ['harassment', 'workplace', 'discrimination'], phones: ['1043'] },
  { key: 'sindh', tags: ['harassment', 'discrimination'], phones: ['1094'] },
  { key: 'drf', tags: ['online', 'harassment'], phones: ['0800-39393'], email: 'helpdesk@digitalrightsfoundation.pk', web: 'https://digitalrightsfoundation.pk' },
  { key: 'humanRights', tags: ['discrimination', 'harassment', 'children'], phones: ['1099'] },
  { key: 'madadgaar', tags: ['children', 'harassment'], phones: ['1098'] },
];

export default function Support() {
  const { t } = useTranslation();
  const { status } = useReporter();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = SERVICES.filter((s) => filter === 'all' || s.tags.includes(filter));
  return (
    <Layout>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 data-read className="text-[1.6rem] leading-tight font-extrabold lg:text-[2rem]">{t('support.title')}</h1>
          <p data-read className="text-muted">{t('support.sub')}</p>
          <ReadAloud />
        </div>

        <fieldset>
          <legend className="mb-2 font-bold">{t('support.filter')}</legend>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f} type="button" className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`support.f.${f}`)}</button>
            ))}
          </div>
        </fieldset>
        <p role="status" className="text-sm text-muted">{t('support.count', { count: shown.length })}</p>

        <ul className="flex flex-col gap-3">
          {shown.map((s) => (
            <li key={s.key} className={`card flex flex-col gap-2 ${s.urgent ? 'border-2 !border-accent !bg-accent-soft' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`icon-tile sm ${s.urgent ? 'accent !bg-surface' : ''}`}><Icon name={s.urgent ? 'phone' : s.key === 'campus' ? 'grad' : s.key === 'drf' ? 'globe' : 'lifebuoy'} size={18} /></span>
                <span className="flex flex-1 flex-col">
                  <b data-read className={s.urgent ? 'text-accent' : ''}>{t(`support.s.${s.key}.name`)}</b>
                  <span data-read className="text-sm text-muted">{t(`support.s.${s.key}.by`)}</span>
                </span>
              </div>
              <p data-read>{t(`support.s.${s.key}.what`)}</p>
              {t(`support.s.${s.key}.when`, { defaultValue: '' }) && (
                <span className="flex items-center gap-1.5 text-sm text-muted"><Icon name="clock" size={14} />{t(`support.s.${s.key}.when`)}</span>
              )}
              <div className="flex flex-wrap gap-2">
                {s.phones?.map((p) => (
                  <a key={p} href={`tel:${p.replace(/[^\d]/g, '')}`} className="btn btn-primary btn-sm no-underline"><Icon name="phone" size={16} /><span dir="ltr">{p}</span></a>
                ))}
                {s.email && <a href={`mailto:${s.email}`} className="btn btn-outline btn-sm no-underline"><Icon name="mail" size={16} /><span dir="ltr">{s.email}</span></a>}
                {s.web && <a href={s.web} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm no-underline"><Icon name="link" size={16} />{t('support.website')}</a>}
                {s.key === 'campus' && (
                  <Link to={status === 'in' ? '/report' : '/signup'} className="btn btn-primary btn-sm no-underline"><Icon name="send" size={16} />{t('support.reportHere')}</Link>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="card-soft flex items-start gap-3 text-[.95rem]">
          <span className="icon-tile sm !bg-surface"><Icon name="eye" size={18} /></span>
          <span data-read>{t('support.privacy')}</span>
        </div>
        <p className="text-sm text-muted">{t('support.checked', { date: 'November 14, 2026' })}</p>
      </div>
    </Layout>
  );
}
