import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { QuickExit } from './QuickExit';
import { Icon, Logo } from './Icon';
import { DisplayPanel } from '../display/DisplayPanel';
import { useIdleLock, useReporter } from '../auth/ReporterAuth';
import { useDisplay, type Theme } from '../display/DisplayProvider';

const THEME_ICONS: { id: Theme; icon: string }[] = [
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
  { id: 'eyecare', icon: 'eye' },
];

// Light / Dark / Eye care, always visible on wider screens (on phones they are in the Display panel).
function ThemeSwitch() {
  const { t } = useTranslation();
  const { prefs, update } = useDisplay();
  return (
    <div role="radiogroup" aria-label={t('display.colours')} className="hidden items-center gap-1 rounded-xl border border-line bg-surface p-1 lg:flex">
      {THEME_ICONS.map((x) => (
        <button key={x.id} type="button" role="radio" aria-checked={prefs.theme === x.id} onClick={() => update({ theme: x.id })}
          className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold ${prefs.theme === x.id ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-surface-2'}`}>
          <Icon name={x.icon} size={16} />
          {t(`display.theme.${x.id}`)}
        </button>
      ))}
    </div>
  );
}

const NAV = [
  { to: '/space', icon: 'home', key: 'nav.home' },
  { to: '/cases', icon: 'folder', key: 'nav.cases' },
  { to: '/journal', icon: 'book', key: 'nav.journal' },
  { to: '/support', icon: 'lifebuoy', key: 'nav.support' },
] as const;

function LanguageToggle() {
  const { i18n } = useTranslation();
  const toUrdu = i18n.language !== 'ur';
  return (
    <button type="button" onClick={() => i18n.changeLanguage(toUrdu ? 'ur' : 'en')} lang={toUrdu ? 'ur' : 'en'}
      className="btn btn-quiet btn-sm !min-w-[3.25rem] whitespace-nowrap !px-2.5 border border-line !bg-surface">
      {toUrdu ? 'اردو' : 'English'}
    </button>
  );
}

function IdleWarning() {
  const { t } = useTranslation();
  const { warning, stay } = useIdleLock();
  const { logout } = useReporter();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (warning && !d.open) d.showModal();
    if (!warning && d.open) d.close();
  }, [warning]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="idle-title" onCancel={(e) => { e.preventDefault(); stay(); }}>
      <div className="flex flex-col gap-4 p-6">
        <h2 id="idle-title" className="text-xl font-bold">{t('idle.title')}</h2>
        <p className="text-muted">{t('idle.body')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-quiet" onClick={logout}>{t('nav.logout')}</button>
          <button type="button" className="btn btn-primary" onClick={stay}>{t('idle.stay')}</button>
        </div>
      </div>
    </dialog>
  );
}

// UI-3: every reporter page has Quick exit, language, Display & reading; logged-in pages add navigation.
export function Layout({ children, reporter = true, narrow = false, focus = false }: { children: ReactNode; reporter?: boolean; narrow?: boolean; focus?: boolean }) {
  const { t } = useTranslation();
  const { status, logout } = useReporter();
  const [displayOpen, setDisplayOpen] = useState(false);
  const loggedIn = reporter && status === 'in';

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-3">
        {t('a11y.skip')}
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-2 gap-y-2 px-4 py-2.5 lg:px-8">
          <Link to={loggedIn ? '/space' : '/'} className="flex min-h-11 items-center gap-2 text-[1.05rem] font-extrabold whitespace-nowrap text-text no-underline">
            <Logo />
            <span className="sr-only min-[440px]:not-sr-only">{t('app.name')}</span>
          </Link>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-1.5">
            {reporter && <LanguageToggle />}
            <ThemeSwitch />
            <button type="button" className="btn btn-sm !px-3 border border-line bg-surface text-text whitespace-nowrap" onClick={() => setDisplayOpen(true)} aria-haspopup="dialog" title={t('display.title')}>
              <Icon name="sun" size={18} />
              {t('display.button')}
            </button>
            {reporter && <QuickExit />}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 lg:px-4">
        {loggedIn && (
          <aside className="sticky top-[4.5rem] hidden h-[calc(100vh-6rem)] w-60 shrink-0 flex-col gap-1 py-6 md:flex">
            <nav aria-label={t('nav.label')} className="flex flex-col gap-1">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-3.5 font-semibold no-underline ${isActive ? 'bg-primary-soft text-primary' : 'text-text-2 hover:bg-surface-2'}`}>
                  <Icon name={n.icon} size={20} />
                  {t(n.key)}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
              <Link to="/break" className="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-text-2 no-underline hover:bg-surface-2"><Icon name="pause" size={20} />{t('space.break')}</Link>
              <button type="button" onClick={logout} className="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-start text-text-2 hover:bg-surface-2"><Icon name="logout" size={20} />{t('nav.logout')}</button>
            </div>
          </aside>
        )}
        <main id="main" className={`mx-auto w-full min-w-0 flex-1 px-4 pt-6 pb-10 lg:pt-8 ${narrow ? 'max-w-xl' : 'max-w-6xl'}`}>{children}</main>
      </div>

      <footer className={`border-t border-line ${loggedIn && !focus ? 'pb-20 md:pb-0' : ''}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted lg:px-8">
          <span>{t('footer.exitHint')}</span>
          <span className="flex items-center gap-4">
            {loggedIn && (
              <button type="button" onClick={logout} className="underline md:hidden">{t('nav.logout')}</button>
            )}
            {reporter && !loggedIn && <Link to="/staff/login" className="underline hover:text-text">{t('header.staff')}</Link>}
          </span>
        </div>
      </footer>

      {loggedIn && !focus && (
        <nav aria-label={t('nav.label')} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface px-1 pt-1.5 pb-2.5 md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-xs font-semibold no-underline ${isActive ? 'text-primary' : 'text-muted'}`}>
              <Icon name={n.icon} size={22} />
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
      )}

      <DisplayPanel open={displayOpen} onClose={() => setDisplayOpen(false)} />
      {loggedIn && <IdleWarning />}
    </div>
  );
}
