import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

// Sign up / Log in / Recover: on wide screens, a calm teal panel of reassurance beside the form.
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const points = [
    { icon: 'lock', text: t('home.privacy.p1') },
    { icon: 'eye', text: t('home.privacy.p2') },
    { icon: 'shield', text: t('home.privacy.p3') },
  ];
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden rounded-[28px] bg-primary p-10 text-on-primary lg:sticky lg:top-24 lg:flex lg:min-h-[34rem] lg:flex-col lg:justify-between">
        <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute -end-24 -bottom-24 opacity-90" width="320" height="320" viewBox="0 0 300 300">
          <circle cx="160" cy="140" r="120" fill="rgba(255,255,255,.08)" />
          <circle cx="160" cy="140" r="80" fill="rgba(255,255,255,.10)" />
          <circle cx="70" cy="230" r="40" fill="var(--ill-2)" opacity=".55" />
        </svg>
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Icon name="shield" size={26} /></span>
          <span className="text-lg font-bold">SpeakSafe</span>
        </div>
        <div className="relative flex flex-col gap-5">
          <h2 className="text-3xl leading-tight font-extrabold">{t('authShell.title')}</h2>
          <p className="max-w-sm text-on-primary-muted">{t('authShell.body')}</p>
          <ul className="flex flex-col gap-3.5">
            {points.map((p) => (
              <li key={p.icon} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Icon name={p.icon} size={20} /></span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-on-primary-muted">{t('authShell.foot')}</p>
      </aside>
      <div className="mx-auto w-full max-w-xl lg:py-4">{children}</div>
    </div>
  );
}
