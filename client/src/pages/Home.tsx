import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { HeroArt, Icon } from '../components/Icon';
import { ReadAloud } from '../components/ReadAloud';
import { HelpNow } from '../components/HelpNow';

// Welcome page for people who are not logged in (FR-1). Phone: one column. Desktop: welcome left, privacy and help right.
export default function Home() {
  const { t } = useTranslation();
  const steps = [
    { icon: 'shield', title: t('home.how.s1'), body: t('home.how.s1b') },
    { icon: 'book', title: t('home.how.s2'), body: t('home.how.s2b') },
    { icon: 'flag', title: t('home.how.s3'), body: t('home.how.s3b') },
  ];
  return (
    <Layout>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <div className="flex flex-col gap-5">
          <section className="hero flex flex-col gap-3 pe-28 lg:min-h-[19rem] lg:justify-center lg:p-12">
            <span className="hidden lg:block"><HeroArtLarge /></span>
            <span className="lg:hidden"><HeroArt /></span>
            <h1 data-read className="relative text-[1.75rem] leading-tight font-extrabold lg:max-w-[20rem] lg:text-[2.6rem] xl:max-w-[24rem]">{t('home.title')}</h1>
            <p data-read className="relative text-muted lg:max-w-[20rem] lg:text-lg xl:max-w-[24rem]">{t('home.intro')}</p>
            <div className="relative hidden flex-wrap gap-3 pt-3 lg:flex">
              <Link to="/signup" className="btn btn-primary whitespace-nowrap"><Icon name="shield" size={20} />{t('home.signup')}</Link>
              <Link to="/login" className="btn btn-outline whitespace-nowrap">{t('home.login')}</Link>
            </div>
          </section>
          <ReadAloud />
          <div className="flex flex-col gap-2.5 lg:hidden">
            <Link to="/signup" className="btn btn-primary w-full"><Icon name="shield" size={20} />{t('home.signup')}</Link>
            <Link to="/login" className="btn btn-outline w-full">{t('home.login')}</Link>
          </div>
          <section aria-labelledby="how-h" className="hidden flex-col gap-3 lg:flex">
            <h2 id="how-h" data-read className="text-lg font-bold">{t('home.how.title')}</h2>
            <ol className="grid grid-cols-3 gap-4">
              {steps.map((s, i) => (
                <li key={i} className="card flex flex-col gap-2.5">
                  <span className="icon-tile sm"><Icon name={s.icon} size={20} /></span>
                  <span data-read className="font-bold">{s.title}</span>
                  <span data-read className="text-sm text-muted">{s.body}</span>
                </li>
              ))}
            </ol>
          </section>
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <Link to="/options" className="card flex flex-col items-start gap-2.5 lg:flex-row lg:items-center lg:gap-4">
              <span className="icon-tile sm"><Icon name="info" size={20} /></span>
              <span className="font-bold">{t('home.options')}</span>
            </Link>
            <Link to="/support" className="card flex flex-col items-start gap-2.5 lg:flex-row lg:items-center lg:gap-4">
              <span className="icon-tile sm"><Icon name="lifebuoy" size={20} /></span>
              <span className="font-bold">{t('home.support')}</span>
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <section className="card-soft flex flex-col gap-3 lg:p-6" aria-labelledby="privacy-h">
            <h2 id="privacy-h" data-read className="font-bold lg:text-lg">{t('home.privacy.title')}</h2>
            <ul className="flex flex-col gap-3 text-[.95rem]">
              <li data-read className="flex items-center gap-3"><span className="icon-tile sm !bg-surface"><Icon name="lock" size={18} /></span>{t('home.privacy.p1')}</li>
              <li data-read className="flex items-center gap-3"><span className="icon-tile sm !bg-surface"><Icon name="eye" size={18} /></span>{t('home.privacy.p2')}</li>
              <li data-read className="flex items-center gap-3"><span className="icon-tile sm !bg-surface"><Icon name="shield" size={18} /></span>{t('home.privacy.p3')}</li>
            </ul>
          </section>
          <HelpNow />
        </div>
      </div>
    </Layout>
  );
}

function HeroArtLarge() {
  return (
    <svg width="190" height="165" viewBox="0 0 150 130" aria-hidden="true" focusable="false" className="pointer-events-none absolute end-6 top-1/2 -translate-y-1/2 rtl:scale-x-[-1]">
      <circle cx="80" cy="66" r="52" fill="var(--ill-1)" />
      <circle cx="44" cy="96" r="28" fill="var(--ill-2)" opacity=".9" />
      <circle cx="122" cy="24" r="14" fill="var(--ill-3)" />
      <path d="M80 30c16 12 20 34 6 52-11-14-15-34-6-52z" fill="var(--primary)" opacity=".8" />
      <path d="M86 82c-3-16-1-34-6-52" stroke="var(--surface)" strokeWidth="2" fill="none" />
      <circle cx="28" cy="34" r="3.5" fill="var(--accent)" opacity=".7" />
      <circle cx="48" cy="18" r="2.2" fill="var(--primary)" />
      <circle cx="132" cy="96" r="4" fill="var(--primary)" opacity=".5" />
    </svg>
  );
}
