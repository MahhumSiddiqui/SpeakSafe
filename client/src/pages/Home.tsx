import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';

const entries = [
  { key: 'options', to: '/options', icon: 'ⓘ' },
  { key: 'journal', to: '/journal', icon: '✎' },
  { key: 'report', to: '/report', icon: '➜' },
  { key: 'check', to: '/check', icon: '⌕' },
] as const;

// FR-1: four clear entry points; calm wording, nothing alarming on screen.
export default function Home() {
  const { t } = useTranslation();
  return (
    <Layout>
      <h1 className="text-3xl font-bold leading-tight">{t('home.title')}</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">{t('home.intro')}</p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {entries.map((e) => (
          <li key={e.key}>
            <Link
              to={e.to}
              className="flex h-full min-h-28 gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm transition hover:border-primary hover:bg-surface-2"
            >
              <span aria-hidden="true" className="text-2xl text-primary">
                {e.icon}
              </span>
              <span>
                <span className="block text-lg font-semibold">{t(`home.${e.key}.title`)}</span>
                <span className="mt-1 block text-muted">{t(`home.${e.key}.desc`)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 rounded-xl border border-line bg-surface-2 p-4 text-sm">
        <span aria-hidden="true">🔒 </span>
        {t('home.privacy')}
      </p>
    </Layout>
  );
}
