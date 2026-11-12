import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { safeGet, safeSet } from '../lib/storage';

// Display & reading preferences, remembered on this device only (localStorage).
export type Theme = 'light' | 'dark' | 'eyecare';
export type Spacing = 'normal' | 'relaxed' | 'extra';
export interface DisplayPrefs {
  theme: Theme;
  textScale: 1 | 1.25 | 1.5 | 1.75;
  lineSpacing: Spacing;
  wideLetters: boolean;
  reduceMotion: boolean;
  discreetTab: boolean;
}

const KEY = 'speaksafe.display';
const LH: Record<Spacing, number> = { normal: 1.6, relaxed: 1.85, extra: 2.1 };

function initial(): DisplayPrefs {
  const base: DisplayPrefs = {
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    textScale: 1,
    lineSpacing: 'normal',
    wideLetters: false,
    reduceMotion: false,
    discreetTab: false,
  };
  try {
    const legacy = safeGet('speaksafe.theme');
    if (legacy === 'light' || legacy === 'dark' || legacy === 'eyecare') base.theme = legacy;
    const saved = JSON.parse(safeGet(KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { ...base, ...saved };
  } catch {
    /* ignore broken storage */
  }
  return base;
}

const Ctx = createContext<{ prefs: DisplayPrefs; update: (p: Partial<DisplayPrefs>) => void }>({
  prefs: initial(),
  update: () => {},
});

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<DisplayPrefs>(initial);

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = prefs.theme;
    r.style.setProperty('--scale', String(prefs.textScale));
    r.style.setProperty('--lh', String(LH[prefs.lineSpacing] ?? 1.6));
    r.style.setProperty('--ls', prefs.wideLetters ? '0.06em' : '0em');
    r.style.setProperty('--ws', prefs.wideLetters ? '0.16em' : '0em');
    if (prefs.reduceMotion) r.dataset.motion = 'reduce';
    else delete r.dataset.motion;
    document.title = prefs.discreetTab ? 'Notes' : 'SpeakSafe';
    safeSet(KEY, JSON.stringify(prefs));
  }, [prefs]);

  const update = (p: Partial<DisplayPrefs>) => setPrefs((old) => ({ ...old, ...p }));
  return <Ctx.Provider value={{ prefs, update }}>{children}</Ctx.Provider>;
}

export const useDisplay = () => useContext(Ctx);
