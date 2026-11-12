import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  trailing?: ReactNode;
}

// Label, hint and error are all tied to the input for screen readers (aria-describedby).
export function TextField({ label, hint, error, trailing, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="label">{label}</label>
      {hint && <span id={`${id}-hint`} className="hint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
        {trailing}
      </div>
      {error && <span id={`${id}-err`} className="error" role="alert">{error}</span>}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type' | 'trailing'>) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      autoCapitalize="off"
      spellCheck={false}
      trailing={
        <button type="button" className="btn btn-quiet btn-sm shrink-0 !px-3" onClick={() => setShow((s) => !s)} aria-pressed={show}
          aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
          <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
          <span className="hidden min-[400px]:inline">{show ? t('auth.hide') : t('auth.show')}</span>
        </button>
      }
    />
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-accent bg-accent-soft p-3.5 text-text">
      <span className="text-accent"><Icon name="alert" size={20} /></span>
      <span>{message}</span>
    </div>
  );
}

export function Busy({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}
