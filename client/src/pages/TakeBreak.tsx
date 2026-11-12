import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { useReporter } from '../auth/ReporterAuth';
import { useDisplay } from '../display/DisplayProvider';

// A gentle pause: a breathing guide (in 4 · hold 4 · out 6). Fully optional; nothing is lost.
const PHASES = [
  { key: 'in', secs: 4, scale: 1 },
  { key: 'hold', secs: 4, scale: 1 },
  { key: 'out', secs: 6, scale: 0.62 },
] as const;

export default function TakeBreak() {
  const { t } = useTranslation();
  const { logout } = useReporter();
  const { prefs } = useDisplay();
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setI((x) => (x + 1) % PHASES.length), PHASES[i].secs * 1000);
    return () => clearTimeout(id);
  }, [i]);

  const p = PHASES[i];
  const reduce = prefs.reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <Layout narrow>
      <div className="flex flex-col items-center gap-6 pt-4 text-center">
        <span className="badge badge-clo"><Icon name="check" size={14} />{t('break.saved')}</span>
        <h1 className="text-[1.65rem] font-extrabold">{t('break.title')}</h1>
        <p className="text-muted">{t('break.intro')}</p>
        <div className="flex h-60 w-60 items-center justify-center rounded-full" style={{ background: 'var(--ill-1)' }}>
          <div
            className="flex h-44 w-44 items-center justify-center rounded-full bg-primary font-bold text-on-primary"
            style={{ transform: `scale(${reduce ? 1 : p.scale})`, transition: reduce ? 'none' : `transform ${p.secs}s ease-in-out` }}
            aria-live="polite"
          >
            {t(`break.${p.key}`)}
          </div>
        </div>
        <p className="text-sm text-muted">{t('break.pattern')}</p>
        <div className="flex w-full flex-col gap-2.5">
          <Link to="/space" className="btn btn-primary w-full">{t('break.ready')}</Link>
          <button type="button" onClick={logout} className="btn btn-quiet w-full"><Icon name="logout" size={18} />{t('break.logout')}</button>
        </div>
        <Link to="/support" className="text-sm">{t('break.talk')}</Link>
      </div>
    </Layout>
  );
}
