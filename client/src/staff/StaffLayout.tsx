import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Icon, Logo } from '../components/Icon';
import { DisplayPanel } from '../display/DisplayPanel';
import { useDisplay, type Theme } from '../display/DisplayProvider';
import { STAFF_IDLE_MS, useStaff, useStaffIdle } from './StaffAuth';

// Committee and admin pages are in English (the reporter side is bilingual), always left-to-right.
function useEnglishLtr() {
  useEffect(() => {
    const r = document.documentElement;
    const prev = { lang: r.lang, dir: r.dir };
    r.lang = 'en';
    r.dir = 'ltr';
    return () => { r.lang = prev.lang; r.dir = prev.dir; };
  }, []);
}

const THEMES: { id: Theme; icon: string; label: string }[] = [
  { id: 'light', icon: 'sun', label: 'Light' },
  { id: 'dark', icon: 'moon', label: 'Dark' },
  { id: 'eyecare', icon: 'eye', label: 'Eye care' },
];

function IdleDialog() {
  const { warn, stay } = useStaffIdle();
  const { logout } = useStaff();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (warn && !d.open) d.showModal();
    if (!warn && d.open) d.close();
  }, [warn]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="sidle" onCancel={(e) => { e.preventDefault(); stay(); }}>
      <div className="flex flex-col gap-4 p-6">
        <h2 id="sidle" className="text-xl font-bold">You'll be signed out in 1 minute</h2>
        <p className="text-muted">For security, committee sessions end after {STAFF_IDLE_MS / 60000} minutes without activity. Nothing you saved will be lost.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => logout()}>Sign out</button>
          <button type="button" className="btn btn-primary" onClick={stay}>Stay signed in</button>
        </div>
      </div>
    </dialog>
  );
}

export function StaffLayout({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  useEnglishLtr();
  const { me, logout, status } = useStaff();
  const { prefs, update } = useDisplay();
  const [display, setDisplay] = useState(false);
  const signedIn = status === 'in' && me;
  const nav = me?.role === 'ADMIN'
    ? [{ to: '/admin', icon: 'shield', label: 'Admin console' }]
    : [{ to: '/staff', icon: 'folder', label: 'My cases' }];

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-3">Skip to main content</a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-2.5 lg:px-8">
          <Link to={signedIn ? (me.role === 'ADMIN' ? '/admin' : '/staff') : '/staff/login'} className="flex min-h-11 items-center gap-2 font-extrabold text-text no-underline">
            <Logo /> SpeakSafe <span className="font-semibold text-muted">· {me?.role === 'ADMIN' ? 'Admin' : 'Committee'}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Colours" className="hidden items-center gap-1 rounded-xl border border-line bg-surface p-1 lg:flex">
              {THEMES.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={prefs.theme === x.id} onClick={() => update({ theme: x.id })}
                  className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold ${prefs.theme === x.id ? 'bg-primary text-on-primary' : 'text-text-2 hover:bg-surface-2'}`}>
                  <Icon name={x.icon} size={16} />{x.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-sm border border-line bg-surface !px-3 text-text" onClick={() => setDisplay(true)}><Icon name="sun" size={18} />Display</button>
            {signedIn && (
              <>
                <span className="hidden items-center gap-1.5 text-sm text-muted xl:flex"><Icon name="clock" size={16} />Signs out after 15 min idle</span>
                <span className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{me.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                  <span className="hidden text-sm font-semibold sm:inline">{me.displayName}</span>
                </span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => logout()}><Icon name="logout" size={16} />Sign out</button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[90rem] flex-1">
        {signedIn && (
          <aside className="hidden w-60 shrink-0 border-e border-line bg-surface px-3 py-6 md:block">
            <nav aria-label="Committee" className="flex flex-col gap-1">
              {nav.map((n) => (
                <NavLink key={n.to} to={n.to} end className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold no-underline ${isActive ? 'bg-primary-soft text-primary' : 'text-text-2 hover:bg-surface-2'}`}>
                  <Icon name={n.icon} size={20} />{n.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        )}
        <main id="main" className={`mx-auto w-full min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8 ${wide ? '' : 'max-w-xl'}`}>{children}</main>
      </div>
      <DisplayPanel open={display} onClose={() => setDisplay(false)} />
      {signedIn && <IdleDialog />}
    </div>
  );
}
