import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { HeroArt, Icon } from '../components/Icon';
import { ReadAloud } from '../components/ReadAloud';
import { HelpNow } from '../components/HelpNow';
import { useReporter } from '../auth/ReporterAuth';
import { loadDraft } from './report/draft';
import { loadVault } from '../lib/vault';
import { useUnread } from '../lib/unread';

// The reporter's home after logging in. Draft, case and "Not alone" cards appear here as those features land.
export default function MySpace() {
  const { t } = useTranslation();
  const { session, flash, clearFlash } = useReporter();
  const [notice] = useState(flash);
  useEffect(() => {
    if (flash) clearFlash();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<{ step: number; updatedAt: string } | null>(null);
  const [caseCount, setCaseCount] = useState<number | null>(null);
  const unread = useUnread(session?.masterKey);
  useEffect(() => {
    if (!session) return;
    loadDraft(session.masterKey).then((d) => setDraft(d ? { step: d.draft.step, updatedAt: d.updatedAt } : null)).catch(() => {});
    loadVault(session.masterKey).then((v) => setCaseCount(v.cases.length)).catch(() => {});
  }, [session]);

  const tiles = [
    { to: '/cases', icon: 'folder', title: t('nav.cases'), sub: unread?.total ? t('messages.newCount', { count: unread.total }) : caseCount ? t('space.casesCount', { count: caseCount }) : t('space.casesSub'), badge: unread?.total ?? 0 },
    { to: '/journal', icon: 'book', title: t('nav.journal'), sub: t('space.journalSub') },
    { to: '/support', icon: 'lifebuoy', title: t('nav.support'), sub: t('space.supportSub') },
    { to: '/options', icon: 'info', title: t('space.options'), sub: t('space.optionsSub') },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5 lg:gap-6">
        {notice && (
          <div role="status" className="flex items-start gap-3 rounded-2xl bg-primary-soft p-3.5">
            <span className="text-primary"><Icon name="check" size={22} /></span>
            <span>{notice === 'welcome' ? t('space.welcomeNew') : t('space.recovered')}</span>
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-6">
          <div className="flex flex-col gap-5">
            <section className="hero flex flex-col gap-2 pe-28 lg:p-8 lg:pe-48">
              <HeroArt />
              <p className="relative text-sm text-muted">{t('space.hello', { name: session?.username })}</p>
              <h1 data-read className="relative text-[1.65rem] leading-tight font-extrabold lg:text-[2rem]">{t('space.title')}</h1>
              <p data-read className="relative hidden text-muted lg:block">{t('space.sub')}</p>
            </section>
            <ReadAloud />
            {draft && (
              <section className="card flex flex-col gap-3 !border-2 !border-primary lg:p-6" aria-labelledby="draft-h">
                <div className="flex items-center justify-between gap-3">
                  <span className="badge badge-rev"><span className="h-2 w-2 rounded-full bg-current" />{t('space.draftSaved')}</span>
                  <span className="text-xs text-muted">{new Date(draft.updatedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <h2 id="draft-h" className="text-lg font-bold">{t('space.draftTitle')}</h2>
                <div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={`h-[7px] rounded-full ${n < draft.step ? 'bg-primary' : 'bg-primary-soft'}`} />)}
                </div>
                <span className="text-sm text-muted">{t('space.draftStep', { n: draft.step, name: t(`report.steps.${draft.step}`) })}</span>
                <Link to="/report" className="btn btn-primary btn-sm self-start">{t('common.continue')}<span className="rtl:rotate-180"><Icon name="arrow" size={18} /></span></Link>
              </section>
            )}
            <Link to="/report" className="card flex items-center gap-4 !border-primary !bg-primary !text-on-primary lg:p-6">
              <span className="icon-tile !bg-white/20 !text-on-primary lg:h-14 lg:w-14"><Icon name="flag" size={26} /></span>
              <span className="flex-1">
                <span data-read className="block text-[1.05rem] font-bold lg:text-xl">{t('space.report')}</span>
                <span className="block text-sm text-on-primary-muted lg:text-base">{t('space.reportSub')}</span>
              </span>
              <span className="hidden rounded-xl bg-white/15 px-4 py-2 font-semibold sm:inline">{t('space.start')}</span>
              <span className="rtl:rotate-180"><Icon name="arrow" size={20} /></span>
            </Link>
            <div className="grid grid-cols-2 gap-3 lg:gap-4">
              {tiles.map((x) => (
                <Link key={x.to} to={x.to} className="card flex flex-col items-start gap-2 lg:flex-row lg:items-center lg:gap-4 lg:p-5">
                  <span className="relative icon-tile sm lg:h-12 lg:w-12"><Icon name={x.icon} size={22} />{'badge' in x && !!x.badge && <span className="count absolute -end-2 -top-2">{x.badge}</span>}</span>
                  <span className="flex flex-col">
                    <span className="font-bold">{x.title}</span>
                    <span className="text-[.8rem] text-muted lg:text-sm">{x.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link to="/break" className="btn btn-quiet btn-sm self-center md:hidden"><Icon name="pause" size={18} />{t('space.break')}</Link>
          </div>
          <div className="flex flex-col gap-5">
            <section className="card-soft flex flex-col gap-3 lg:p-6" aria-labelledby="safe-h">
              <h2 id="safe-h" className="font-bold">{t('space.safeTitle')}</h2>
              <ul className="flex flex-col gap-3 text-[.95rem]">
                <li className="flex items-start gap-3"><span className="icon-tile sm !bg-surface"><Icon name="lock" size={18} /></span>{t('space.safe1')}</li>
                <li className="flex items-start gap-3"><span className="icon-tile sm !bg-surface"><Icon name="eye" size={18} /></span>{t('space.safe2')}</li>
                <li className="flex items-start gap-3"><span className="icon-tile sm !bg-surface"><Icon name="key" size={18} /></span>{t('space.safe3')}</li>
              </ul>
            </section>
            <HelpNow />
          </div>
        </div>
      </div>
    </Layout>
  );
}
