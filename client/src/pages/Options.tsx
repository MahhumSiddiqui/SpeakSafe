import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { ReadAloud } from '../components/ReadAloud';
import { useReporter } from '../auth/ReporterAuth';

// Know your options: plain-language answers to "does this count?", "what happens next?",
// "who will see it?" and "what can't SpeakSafe promise?". Readable without an account.
const SECTIONS = ['counts', 'next', 'modes', 'who', 'limits', 'choices'] as const;
const ICONS: Record<(typeof SECTIONS)[number], string> = {
  counts: 'info', next: 'clock', modes: 'eye', who: 'lock', limits: 'alert', choices: 'map',
};
const STEPS = ['received', 'read', 'review', 'inquiry', 'closure'] as const;
const MODES = ['ANONYMOUS', 'CONFIDENTIAL', 'NAMED'] as const;

export default function Options() {
  const { t } = useTranslation();
  const { status } = useReporter();
  const inside = status === 'in';
  return (
    <Layout>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 data-read className="text-[1.6rem] leading-tight font-extrabold lg:text-[2rem]">{t('options.title')}</h1>
          <p data-read className="text-muted">{t('options.sub')}</p>
          <ReadAloud />
        </div>

        {SECTIONS.map((s, i) => (
          <details key={s} className="card group !p-0" open={i === 0}>
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="icon-tile sm"><Icon name={ICONS[s]} size={18} /></span>
              <span data-read className="flex-1 text-lg font-bold">{t(`options.${s}.title`)}</span>
              <span className="transition group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90"><Icon name="arrow" size={18} /></span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-line px-4 pt-3 pb-5 text-[1rem]">
              {s === 'counts' && (
                <>
                  <p data-read>{t('options.counts.body')}</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {(['Harassment', 'Discrimination', 'Academic misconduct', 'Fraud or financial misconduct', 'Safety concern', 'Other'] as const).map((c) => (
                      <li key={c} className="rounded-xl bg-surface-2 p-3">
                        <b data-read className="block">{t(`categories.${c}`)}</b>
                        <span data-read className="text-sm text-muted">{t(`options.counts.ex.${c}`)}</span>
                      </li>
                    ))}
                  </ul>
                  <p data-read className="font-semibold">{t('options.counts.unsure')}</p>
                </>
              )}
              {s === 'next' && (
                <>
                  <p data-read>{t('options.next.body')}</p>
                  <ol className="flex flex-col gap-3">
                    {STEPS.map((st, n) => (
                      <li key={st} className="flex gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">{n + 1}</span>
                        <span className="flex flex-col">
                          <b data-read>{t(`options.next.${st}.t`)}</b>
                          <span data-read className="text-muted">{t(`options.next.${st}.b`)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p data-read className="text-sm text-muted">{t('options.next.note')}</p>
                </>
              )}
              {s === 'modes' && (
                <>
                  <p data-read>{t('options.modes.body')}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[30rem] border-collapse text-start text-[.95rem]">
                      <caption className="sr-only">{t('options.modes.title')}</caption>
                      <thead>
                        <tr className="border-b border-line text-sm text-muted">
                          <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('options.modes.col.mode')}</th>
                          <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('options.modes.col.name')}</th>
                          <th scope="col" className="py-2 text-start font-semibold">{t('options.modes.col.good')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MODES.map((m) => (
                          <tr key={m} className="border-b border-line align-top last:border-0">
                            <th scope="row" className="py-3 pe-3 text-start font-bold">{t(`mode.${m}.title`)}</th>
                            <td data-read className="py-3 pe-3">{t(`options.modes.${m}.name`)}</td>
                            <td data-read className="py-3">{t(`options.modes.${m}.good`)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p data-read className="text-sm text-muted">{t('options.modes.change')}</p>
                </>
              )}
              {s === 'who' && (
                <>
                  <p data-read>{t('options.who.body')}</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {(['you', 'members'] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2 rounded-xl bg-primary-soft p-3"><Icon name="check" size={18} /><span data-read>{t(`options.who.can.${k}`)}</span></li>
                    ))}
                    {(['excluded', 'admin', 'server', 'others'] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2 rounded-xl bg-surface-2 p-3"><Icon name="x" size={18} /><span data-read>{t(`options.who.cannot.${k}`)}</span></li>
                    ))}
                  </ul>
                  <p data-read className="text-sm text-muted">{t('options.who.log')}</p>
                </>
              )}
              {s === 'limits' && (
                <>
                  <p data-read>{t('options.limits.body')}</p>
                  <ul className="flex list-disc flex-col gap-2 ps-6">
                    {(['style', 'small', 'device', 'words'] as const).map((k) => <li key={k} data-read>{t(`options.limits.${k}`)}</li>)}
                  </ul>
                </>
              )}
              {s === 'choices' && (
                <>
                  <p data-read>{t('options.choices.body')}</p>
                  <ul className="flex flex-col gap-2">
                    {(['wait', 'journal', 'talk', 'report', 'outside'] as const).map((k) => (
                      <li key={k} className="rounded-xl bg-surface-2 p-3"><b data-read className="block">{t(`options.choices.${k}.t`)}</b><span data-read className="text-muted">{t(`options.choices.${k}.b`)}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        ))}

        <div className="grid gap-3 sm:grid-cols-3">
          <Link to={inside ? '/report' : '/signup'} className="btn btn-primary"><Icon name="send" size={18} />{inside ? t('options.cta.report') : t('home.signup')}</Link>
          {inside && <Link to="/journal" className="btn btn-outline"><Icon name="book" size={18} />{t('options.cta.journal')}</Link>}
          <Link to="/support" className="btn btn-outline"><Icon name="lifebuoy" size={18} />{t('options.cta.support')}</Link>
        </div>
      </div>
    </Layout>
  );
}
