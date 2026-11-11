import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { QuickExit } from './QuickExit';
import { DisplaySwitch } from './DisplaySwitch';
import { LanguageSwitch } from './LanguageSwitch';

// UI-3: display switch on every page; Quick Exit on every reporter page.
export function Layout({ children, reporter = true }: { children: ReactNode; reporter?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-3">
        {t('a11y.skip')}
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-h-11 items-center text-xl font-bold text-primary">
            {t('app.name')}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <DisplaySwitch />
            {reporter && <LanguageSwitch />}
            {reporter && <QuickExit />}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted">
          <span>{t('footer.demo')}</span>
          {reporter && (
            <Link to="/staff/login" className="underline hover:text-text">
              {t('header.staff')}
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
