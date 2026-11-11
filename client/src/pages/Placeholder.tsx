import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';

export default function Placeholder({ title, reporter = true }: { title: string; reporter?: boolean }) {
  const { t } = useTranslation();
  return (
    <Layout reporter={reporter}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{t('placeholder.soon')}</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-on-primary">
        {t('placeholder.back')}
      </Link>
    </Layout>
  );
}
