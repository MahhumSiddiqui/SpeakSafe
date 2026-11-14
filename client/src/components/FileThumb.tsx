import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Thumbnails stay blurred until tapped (trauma-informed: no sudden distressing images). */
export function FileThumb({ kind, url, onNeed }: { kind: 'image' | 'pdf' | 'voice'; url?: string; onNeed: () => void }) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { if (kind === 'image' && !url) onNeed(); }, [kind, url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (kind !== 'image') {
    return <div className="flex aspect-square items-center justify-center rounded-xl bg-surface-2 text-primary"><Icon name={kind === 'voice' ? 'mic' : 'file'} size={40} /></div>;
  }
  return (
    <button type="button" onClick={() => setRevealed((r) => !r)} className="relative aspect-square overflow-hidden rounded-xl bg-surface-2"
      aria-label={revealed ? t('evidence.hide') : t('evidence.reveal')}>
      {url && <img src={url} alt="" className={`h-full w-full object-cover transition ${revealed ? '' : 'scale-110 blur-xl'}`} />}
      {!revealed && <span className="absolute inset-x-2 bottom-2 rounded-full bg-surface px-2 py-1 text-xs font-bold text-text">{t('evidence.reveal')}</span>}
    </button>
  );
}
