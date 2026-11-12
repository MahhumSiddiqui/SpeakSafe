import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { AuthShell } from '../components/AuthShell';
import { Icon } from '../components/Icon';
import { Busy, FormError, PasswordField, TextField } from '../components/Field';
import { useReporter } from '../auth/ReporterAuth';
import { isRecoveryWord, passwordStrength } from '../lib/words';
import { errorText } from '../lib/errors';
import { MIN_PASSWORD, StrengthMeter } from './Signup';

// Forgotten password: the 6 recovery words unlock the space and set a new password.
export default function Recover() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { recover } = useReporter();
  const [username, setUsername] = useState('');
  const [words, setWords] = useState<string[]>(Array(6).fill(''));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const setWord = (i: number, v: string) => {
    // Pasting all six words into the first box fills every box.
    const parts = v.trim().split(/\s+/);
    if (i === 0 && parts.length === 6) return setWords(parts.map((p) => p.toLowerCase()));
    setWords((w) => w.map((x, j) => (j === i ? v : x)));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!username.trim()) errs.username = t('login.missing');
    const bad = words.findIndex((w) => !isRecoveryWord(w));
    if (bad >= 0) errs.words = t('recover.badWord', { n: bad + 1 });
    if (password.length < MIN_PASSWORD) errs.password = t('auth.err.passwordShort', { n: MIN_PASSWORD });
    else if (passwordStrength(password) < 2) errs.password = t('auth.err.passwordWeak');
    if (confirm !== password) errs.confirm = t('auth.err.mismatch');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError('');
    try {
      await recover(username.trim().toLowerCase(), words.join(' '), password);
      nav('/space', { replace: true });
    } catch (err) {
      setFormError(errorText(err, t));
      setBusy(false);
    }
  };

  return (
    <Layout>
      <AuthShell>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Link to="/login" className="inline-flex min-h-11 items-center gap-1 self-start text-sm no-underline"><Icon name="back" size={18} />{t('common.back')}</Link>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[1.65rem] leading-tight font-extrabold">{t('recover.title')}</h1>
          <p className="text-muted">{t('recover.intro')}</p>
        </div>
        <TextField label={t('auth.username')} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} error={errors.username} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{t('recover.words')}</legend>
          <span className="hint text-sm text-muted">{t('recover.wordsHint')}</span>
          <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3">
            {words.map((w, i) => (
              <label key={i} className="flex items-center gap-2">
                <span className="w-5 text-end text-sm text-muted">{i + 1}</span>
                <input className="input" value={w} onChange={(e) => setWord(i, e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false}
                  aria-label={t('signup.wordN', { n: i + 1 })} aria-invalid={errors.words && !isRecoveryWord(w) ? true : undefined} />
              </label>
            ))}
          </div>
          {errors.words && <span className="error text-sm font-semibold text-accent" role="alert">{errors.words}</span>}
        </fieldset>
        <div className="flex flex-col gap-2">
          <PasswordField label={t('recover.newPassword')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={errors.password} />
          <StrengthMeter value={password} />
        </div>
        <PasswordField label={t('signup.confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={errors.confirm} />
        <FormError message={formError} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? <Busy label={t('recover.busy')} /> : t('recover.submit')}</button>
      </form>
      </AuthShell>
    </Layout>
  );
}
