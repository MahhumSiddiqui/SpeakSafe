import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { ReadAloud } from '../../components/ReadAloud';
import type { SentResult } from './send';
import { NotAloneBanner } from '../../components/NotAlone';

export default function Sent() {
  const { t } = useTranslation();
  const res = useLocation().state as SentResult | null;
  const [copied, setCopied] = useState(false);
  if (!res) return <Navigate to="/cases" replace />;
  const fp = res.fingerprint.toUpperCase().match(/.{4}/g)!;

  return (
    <Layout>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
        <svg width="120" height="110" viewBox="0 0 120 110" aria-hidden="true">
          <circle cx="60" cy="55" r="48" fill="var(--ill-1)" />
          <circle cx="60" cy="55" r="32" fill="var(--primary)" />
          <path d="M46 56l10 10 18-20" fill="none" stroke="var(--primary-text)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="14" cy="20" r="4" fill="var(--accent)" opacity=".7" />
          <circle cx="106" cy="16" r="3" fill="var(--primary)" />
          <circle cx="104" cy="92" r="5" fill="var(--ill-2)" />
        </svg>
        <h1 data-read className="text-[1.75rem] font-extrabold lg:text-[2.2rem]">{res.held ? t('notAlone.sentHeldTitle') : t('sent.title')}</h1>
        <p data-read className="text-muted">{res.held ? t('notAlone.sentHeldBody') : t('sent.body')}</p>
        <ReadAloud />
        {res.notAlone && <NotAloneBanner />}
        {res.failedFiles > 0 && <div role="alert" className="w-full rounded-2xl border-2 border-accent bg-accent-soft p-3.5 text-start">{t('sent.failed', { count: res.failedFiles })}</div>}
        <div className="card flex w-full flex-col gap-2 text-start">
          <span className="text-sm text-muted">{t('sent.caseId')}</span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-2xl font-bold tracking-wider" dir="ltr">{res.caseId}</span>
            <span className="flex items-center gap-2">
              {res.held
                ? <span className="badge badge-rev"><Icon name="clock" size={13} />{t('notAlone.waiting')}</span>
                : <span className="badge badge-rec"><span className="h-2 w-2 rounded-full bg-current" />{t('status.RECEIVED')}</span>}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigator.clipboard?.writeText(res.caseId).then(() => setCopied(true))}>
                <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? t('signup.copied') : t('sent.copy')}
              </button>
            </span>
          </div>
          <span className="text-xs text-muted" dir="ltr">{t('sent.fingerprint')}: <span className="font-mono">{fp.slice(0, 4).join(' ')} … {fp.slice(-2).join(' ')}</span></span>
          <span className="text-xs text-muted">{t('sent.fingerprintHint')}</span>
        </div>
        {!res.held && <div className="card-soft flex w-full flex-col gap-3 text-start">
          <h2 className="font-bold">{t('sent.next')}</h2>
          <p className="flex items-start gap-3"><span className="icon-tile sm !bg-surface"><Icon name="users" size={18} /></span>{t('sent.next1')}</p>
          <p className="flex items-start gap-3"><span className="icon-tile sm !bg-surface"><Icon name="folder" size={18} /></span>{t('sent.next2')}</p>
        </div>}
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Link to={`/cases/${res.caseId}`} className="btn btn-primary">{t('sent.view')}</Link>
          <Link to="/space" className="btn btn-quiet">{t('sent.home')}</Link>
        </div>
      </div>
    </Layout>
  );
}
