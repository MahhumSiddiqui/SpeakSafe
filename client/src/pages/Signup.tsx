import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { AuthShell } from '../components/AuthShell';
import { Icon } from '../components/Icon';
import { Busy, FormError, PasswordField, TextField } from '../components/Field';
import { ReadAloud } from '../components/ReadAloud';
import { useReporter } from '../auth/ReporterAuth';
import { newRecoveryWords, passwordStrength, suggestUsername } from '../lib/words';
import { sodium } from '../lib/keys';
import { errorText } from '../lib/errors';
import { ApiError } from '../lib/api';

const USERNAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MIN_PASSWORD = 10;

export function StrengthMeter({ value }: { value: string }) {
  const { t } = useTranslation();
  const score = passwordStrength(value);
  const label = value ? t(`auth.strength.${score}`) : '';
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="strength" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className={score >= i ? 'on' : ''} />)}
      </div>
      {label && <span className={`text-sm font-semibold ${score >= 3 ? 'text-primary' : 'text-muted'}`}>{label}</span>}
    </div>
  );
}

// Sign up in two steps: (1) username + password, (2) save the recovery words and prove it.
export default function Signup() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { signup } = useReporter();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [check, setCheck] = useState<[number, number]>([1, 4]);
  const [answers, setAnswers] = useState(['', '']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    suggestUsername().then(setUsername);
  }, []);

  const goStep2 = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const name = username.trim().toLowerCase();
    if (name.length < 3 || name.length > 32 || !USERNAME_RE.test(name)) errs.username = t('auth.err.username');
    if (password.length < MIN_PASSWORD) errs.password = t('auth.err.passwordShort', { n: MIN_PASSWORD });
    else if (passwordStrength(password) < 2) errs.password = t('auth.err.passwordWeak');
    if (confirm !== password) errs.confirm = t('auth.err.mismatch');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setUsername(name);
    const w = await newRecoveryWords(6);
    const s = await sodium();
    const a = s.randombytes_uniform(6);
    let b = s.randombytes_uniform(5);
    if (b >= a) b++;
    setWords(w);
    setCheck(a < b ? [a, b] : [b, a]);
    setAnswers(['', '']);
    setStep(2);
    window.scrollTo(0, 0);
  };

  const wordsOk = useMemo(
    () => words.length === 6 && answers[0].trim().toLowerCase() === words[check[0]] && answers[1].trim().toLowerCase() === words[check[1]],
    [answers, words, check],
  );

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!wordsOk || busy) return;
    setBusy(true);
    setFormError('');
    try {
      await signup(username, password, words);
      nav('/space', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStep(1);
        setErrors({ username: err.message });
      } else setFormError(errorText(err, t));
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Layout>
      <AuthShell>
      {step === 1 ? (
        <form onSubmit={goStep2} noValidate className="flex flex-col gap-5">
          <Link to="/" className="inline-flex min-h-11 items-center gap-1 self-start text-sm no-underline"><Icon name="back" size={18} />{t('common.back')}</Link>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('auth.stepOf', { n: 1, total: 2 })}</span>
            <h1 data-read className="text-[1.65rem] leading-tight font-extrabold">{t('signup.title')}</h1>
            <p data-read className="text-muted">{t('signup.intro')}</p>
          </div>
          <ReadAloud />
          <TextField
            label={t('auth.username')}
            hint={t('signup.usernameHint')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            error={errors.username}
            className="input font-semibold"
            trailing={
              <button type="button" className="btn btn-quiet btn-sm shrink-0 !min-h-[3.125rem] !px-3.5" onClick={() => suggestUsername().then(setUsername)} aria-label={t('signup.suggest')} title={t('signup.suggest')}>
                <Icon name="refresh" size={20} />
              </button>
            }
          />
          <div className="flex flex-col gap-2">
            <PasswordField label={t('auth.password')} hint={t('signup.passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={errors.password} />
            <StrengthMeter value={password} />
          </div>
          <PasswordField label={t('signup.confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={errors.confirm} />
          <div className="card-soft flex items-start gap-3 text-[.95rem]">
            <span className="text-primary"><Icon name="shield" size={22} /></span>
            <span data-read>{t('signup.privacyNote')}</span>
          </div>
          <button type="submit" className="btn btn-primary w-full">{t('common.continue')}<Icon name="arrow" size={20} /></button>
          <p className="text-center text-sm">{t('signup.haveAccount')} <Link to="/login">{t('home.login')}</Link></p>
        </form>
      ) : (
        <form onSubmit={create} noValidate className="flex flex-col gap-5">
          <button type="button" onClick={() => setStep(1)} className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-primary underline">
            <Icon name="back" size={18} />{t('common.back')}
          </button>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('auth.stepOf', { n: 2, total: 2 })}</span>
            <h1 data-read className="text-[1.65rem] leading-tight font-extrabold">{t('signup.wordsTitle')}</h1>
            <p data-read className="text-muted">{t('signup.wordsIntro')}</p>
          </div>
          <ReadAloud />
          <div className="card flex flex-col gap-3 !border-2 !border-primary">
            <ol className="flex flex-wrap gap-2" aria-label={t('signup.wordsTitle')}>
              {words.map((w, i) => (
                <li key={i} className="word-chip"><i>{i + 1}</i><span data-read>{w}</span></li>
              ))}
            </ol>
            <button type="button" onClick={copy} className="btn btn-quiet btn-sm self-start">
              <Icon name={copied ? 'check' : 'copy'} size={18} />{copied ? t('signup.copied') : t('signup.copy')}
            </button>
          </div>
          <div className="card-soft flex items-start gap-3 text-[.95rem]">
            <span className="icon-tile sm accent"><Icon name="alert" size={18} /></span>
            <span data-read>{t('signup.wordsWarning')}</span>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend data-read className="mb-3 font-bold">{t('signup.checkTitle', { a: check[0] + 1, b: check[1] + 1 })}</legend>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <TextField key={i} label={t('signup.wordN', { n: check[i] + 1 })} value={answers[i]} autoComplete="off" autoCapitalize="off" spellCheck={false}
                  onChange={(e) => setAnswers((a) => (i === 0 ? [e.target.value, a[1]] : [a[0], e.target.value]))} />
              ))}
            </div>
          </fieldset>
          <FormError message={formError} />
          <button type="submit" className="btn btn-primary w-full" disabled={!wordsOk || busy} aria-disabled={!wordsOk || busy}>
            {busy ? <Busy label={t('signup.creating')} /> : t('signup.create')}
          </button>
          {!wordsOk && <p className="text-center text-sm text-muted">{t('signup.checkHint')}</p>}
        </form>
      )}
      </AuthShell>
    </Layout>
  );
}
