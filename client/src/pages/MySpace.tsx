import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { HeroArt, Icon } from '../components/Icon';
import { ReadAloud } from '../components/ReadAloud';
import { HelpNow } from '../components/HelpNow';
import { useReporter } from '../auth/ReporterAuth';

// The reporter's home after logging in. Draft, case and "Not alone" cards appear here as those features land.
export default function MySpace() {
  const { t } = useTranslation();
  const { session, flash, clearFlash } = useReporter();
  const [notice] = useState(flash);
  useEffect(() => {
    if (flash) clearFlash();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles = [
    { to: '/cases', icon: 'folder', title: t('nav.cases'), sub: t('space.casesSub') },
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
                  <span className="icon-tile sm lg:h-12 lg:w-12"><Icon name={x.icon} size={22} /></span>
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
