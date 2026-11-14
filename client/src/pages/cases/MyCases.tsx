import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { Busy, FormError } from '../../components/Field';
import { useReporter } from '../../auth/ReporterAuth';
import { loadVault } from '../../lib/vault';
import { errorText } from '../../lib/errors';
import { fetchCase, STATUS_BADGE, type CaseMeta } from './caseData';
import { useUnread } from '../../lib/unread';

export default function MyCases() {
  const { t, i18n } = useTranslation();
  const { session } = useReporter();
  const [cases, setCases] = useState<CaseMeta[] | null>(null);
  const [error, setError] = useState('');
  const unread = useUnread(session?.masterKey);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const v = await loadVault(session.masterKey);
      const metas = await Promise.all(v.cases.map((c) => fetchCase(session.masterKey, c).then((r) => r.meta).catch(() => null)));
      setCases(metas.filter((m): m is CaseMeta => !!m));
    })().catch((e) => { setError(errorText(e, t)); setCases([]); });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (d: string) => new Date(d).toLocaleDateString(i18n.language === 'ur' ? 'ur-PK' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.65rem] font-extrabold lg:text-[2rem]">{t('cases.title')}</h1>
            <p className="text-muted">{t('cases.intro')}</p>
          </div>
          <Link to="/report" className="btn btn-primary btn-sm"><Icon name="flag" size={18} />{t('space.report')}</Link>
        </div>
        <FormError message={error} />
        {!cases ? (
          <p className="text-muted"><Busy label={t('cases.loading')} /></p>
        ) : cases.length === 0 ? (
          <div className="card-soft flex flex-col items-center gap-3 py-10 text-center">
            <span className="icon-tile"><Icon name="folder" /></span>
            <p className="font-semibold">{t('cases.empty')}</p>
            <p className="max-w-md text-sm text-muted">{t('cases.emptyHint')}</p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {cases.map((c) => (
              <li key={c.id}>
                <Link to={`/cases/${c.id}`} className="card flex flex-col gap-3 lg:p-5">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-mono text-lg font-bold" dir="ltr">{c.id}</span>
                    {c.held
                      ? <span className="badge badge-rev"><Icon name="clock" size={13} />{t('notAlone.waiting')}</span>
                      : <span className={`badge ${STATUS_BADGE[c.status]}`}><span className="h-2 w-2 rounded-full bg-current" />{t(`status.${c.status}`)}</span>}
                  </span>
                  {c.notAlone > 0 && <span className="badge badge-rec self-start"><Icon name="users" size={13} />{t('notAlone.badge')}</span>}
                  {!!unread?.perCase[c.id] && <span className="badge badge-inq self-start"><Icon name="mail" size={13} />{t('messages.newCount', { count: unread.perCase[c.id] })}</span>}
                  <span className="text-[.95rem]">{t(`categories.${c.category}`, { defaultValue: c.category })} · {t(`mode.${c.mode}.title`)}</span>
                  <span className="text-sm text-muted">{t('cases.sentOn', { date: fmt(c.submittedAt) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
