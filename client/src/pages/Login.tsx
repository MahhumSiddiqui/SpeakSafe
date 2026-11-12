import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { AuthShell } from '../components/AuthShell';
import { HeroArt, Icon } from '../components/Icon';
import { Busy, FormError, PasswordField, TextField } from '../components/Field';
import { useReporter } from '../auth/ReporterAuth';
import { errorText } from '../lib/errors';

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { login } = useReporter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) return setError(t('login.missing'));
    setBusy(true);
    setError('');
    try {
      await login(username.trim().toLowerCase(), password);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from.startsWith('/') ? from : '/space', { replace: true });
    } catch (err) {
      setError(errorText(err, t));
      setBusy(false);
    }
  };

  return (
    <Layout>
      <AuthShell>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <section className="hero flex flex-col gap-2 pe-28">
          <HeroArt />
          <h1 className="relative text-[1.65rem] leading-tight font-extrabold">{t('login.title')}</h1>
          <p className="relative text-muted">{t('login.intro')}</p>
        </section>
        <TextField label={t('auth.username')} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} />
        <PasswordField label={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <FormError message={error} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? <Busy label={t('login.busy')} /> : t('home.login')}</button>
        <Link to="/recover" className="self-center text-center text-sm">{t('login.forgot')}</Link>
        <div className="card-soft flex items-start gap-3 text-[.95rem]">
          <span className="text-primary"><Icon name="info" size={20} /></span>
          <span>{t('login.sharedNote')}</span>
        </div>
        <p className="text-center text-sm">{t('login.new')} <Link to="/signup">{t('home.signup')}</Link></p>
      </form>
      </AuthShell>
    </Layout>
  );
}
