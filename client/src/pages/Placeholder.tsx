import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useReporter } from '../auth/ReporterAuth';

// Shown only for sections that are scheduled for the next build steps.
export default function Placeholder({ title, reporter = true }: { title: string; reporter?: boolean }) {
  const { t } = useTranslation();
  const { status } = useReporter();
  return (
    <Layout reporter={reporter} narrow>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{t('placeholder.soon')}</p>
      <Link to={status === 'in' ? '/space' : '/'} className="btn btn-primary mt-6">{t('placeholder.back')}</Link>
    </Layout>
  );
}
