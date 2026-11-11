import { BrowserRouter, Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';
import Placeholder from './pages/Placeholder';
import NotFound from './pages/NotFound';

export default function App() {
  const { t } = useTranslation();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/options" element={<Placeholder title={t('home.options.title')} />} />
        <Route path="/journal" element={<Placeholder title={t('home.journal.title')} />} />
        <Route path="/report" element={<Placeholder title={t('home.report.title')} />} />
        <Route path="/check" element={<Placeholder title={t('home.check.title')} />} />
        <Route path="/staff/login" element={<Placeholder title={t('header.staff')} reporter={false} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
