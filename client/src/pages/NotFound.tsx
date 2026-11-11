import { useTranslation } from 'react-i18next';
import Placeholder from './Placeholder';

export default function NotFound() {
  const { t } = useTranslation();
  return <Placeholder title={t('notFound.title')} />;
}
