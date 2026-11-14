import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Recover from './pages/Recover';
import MySpace from './pages/MySpace';
import TakeBreak from './pages/TakeBreak';
import Journal from './pages/Journal';
import Placeholder from './pages/Placeholder';
import ReportWizard from './pages/report/ReportWizard';
import Sent from './pages/report/Sent';
import MyCases from './pages/cases/MyCases';
import CaseView from './pages/cases/CaseView';
import NotFound from './pages/NotFound';
import { GuestOnly, RequireReporter } from './auth/RequireReporter';
import StaffLogin from './staff/StaffLogin';
import Dashboard from './staff/Dashboard';
import StaffCase from './staff/StaffCase';
import { RequireStaff } from './staff/RequireStaff';
import Account from './staff/Account';
import Users from './staff/admin/Users';
import Categories from './staff/admin/Categories';
import Audit from './staff/admin/Audit';
import Stats from './staff/admin/Stats';

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
      <Route path="/report" element={<RequireReporter><ReportWizard /></RequireReporter>} />
      <Route path="/report/sent" element={<RequireReporter><Sent /></RequireReporter>} />
      <Route path="/cases" element={<RequireReporter><MyCases /></RequireReporter>} />
      <Route path="/cases/:id" element={<RequireReporter><CaseView /></RequireReporter>} />
      <Route path="/journal" element={<RequireReporter><Journal /></RequireReporter>} />
      <Route path="/options" element={<Placeholder title={t('home.options')} />} />
      <Route path="/support" element={<Placeholder title={t('home.support')} />} />
      <Route path="/staff/login" element={<StaffLogin />} />
      <Route path="/staff" element={<RequireStaff role="HANDLER"><Dashboard /></RequireStaff>} />
      <Route path="/staff/cases/:id" element={<RequireStaff role="HANDLER"><StaffCase /></RequireStaff>} />
      <Route path="/staff/account" element={<RequireStaff><Account /></RequireStaff>} />
      <Route path="/admin" element={<RequireStaff role="ADMIN"><Users /></RequireStaff>} />
      <Route path="/admin/categories" element={<RequireStaff role="ADMIN"><Categories /></RequireStaff>} />
      <Route path="/admin/audit" element={<RequireStaff role="ADMIN"><Audit /></RequireStaff>} />
      <Route path="/admin/stats" element={<RequireStaff role="ADMIN"><Stats /></RequireStaff>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
