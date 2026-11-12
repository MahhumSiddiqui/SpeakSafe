import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Recover from './pages/Recover';
import MySpace from './pages/MySpace';
import TakeBreak from './pages/TakeBreak';
import Placeholder from './pages/Placeholder';
import NotFound from './pages/NotFound';
import { GuestOnly, RequireReporter } from './auth/RequireReporter';

export default function App() {
  const { t } = useTranslation();
  return (
    <Routes>
      <Route path="/" element={<GuestOnly><Home /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/recover" element={<GuestOnly><Recover /></GuestOnly>} />
      <Route path="/space" element={<RequireReporter><MySpace /></RequireReporter>} />
      <Route path="/break" element={<RequireReporter><TakeBreak /></RequireReporter>} />
      <Route path="/report" element={<RequireReporter><Placeholder title={t('space.report')} /></RequireReporter>} />
      <Route path="/cases" element={<RequireReporter><Placeholder title={t('nav.cases')} /></RequireReporter>} />
      <Route path="/journal" element={<RequireReporter><Placeholder title={t('nav.journal')} /></RequireReporter>} />
      <Route path="/options" element={<Placeholder title={t('home.options')} />} />
      <Route path="/support" element={<Placeholder title={t('home.support')} />} />
      <Route path="/staff/login" element={<Placeholder title={t('header.staff')} reporter={false} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
