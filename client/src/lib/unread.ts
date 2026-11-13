import { useEffect, useState } from 'react';
import { loadVault } from './vault';
import { fetchCase } from '../pages/cases/caseData';

// Counts committee messages newer than the reporter's last visit to each case (kept in the encrypted vault).
let cache: { at: number; total: number; perCase: Record<string, number> } | null = null;
const listeners = new Set<() => void>();

export function invalidateUnread() {
  cache = null;
  listeners.forEach((l) => l());
}

async function compute(masterKey: Uint8Array) {
  const v = await loadVault(masterKey);
  const perCase: Record<string, number> = {};
  await Promise.all(v.cases.map(async (c) => {
    try {
      const { meta } = await fetchCase(masterKey, c);
      const since = new Date(c.lastReadAt ?? c.at).getTime();
      perCase[c.id] = meta.messages.filter((m) => m.from === 'committee' && new Date(m.createdAt).getTime() > since).length;
    } catch {
      perCase[c.id] = 0;
    }
  }));
  return { at: Date.now(), total: Object.values(perCase).reduce((a, b) => a + b, 0), perCase };
}

export function useUnread(masterKey: Uint8Array | undefined) {
  const [state, setState] = useState(cache);
  useEffect(() => {
    if (!masterKey) return;
    let alive = true;
    const run = () => {
      if (cache && Date.now() - cache.at < 60_000) { setState(cache); return; }
      compute(masterKey).then((r) => { cache = r; if (alive) setState(r); }).catch(() => {});
    };
    run();
    listeners.add(run);
    return () => { alive = false; listeners.delete(run); };
  }, [masterKey]);
  return state;
}
