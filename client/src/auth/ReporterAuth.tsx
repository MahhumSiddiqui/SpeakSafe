import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, setCsrfToken } from '../lib/api';
import { createAccountKeys, deriveKeys, fromB64, normalizePhrase, open, rewrapForPassword, sodium, toB64 } from '../lib/keys';

// The reporter's private space. The master key lives only in this tab (sessionStorage), never on the server.
// Quick Exit, Log out and the idle lock all wipe it.
interface Bundle { username: string; masterKeyEnc: string; secretKeyEnc: string; publicKey: string; csrfToken: string }
interface Session { username: string; masterKey: Uint8Array }
type Status = 'loading' | 'in' | 'out';
export type Flash = 'welcome' | 'recovered' | null;

const STORE = 'ss.session';
export const IDLE_LOCK_MS = 10 * 60 * 1000;
export const IDLE_WARN_MS = 9 * 60 * 1000;

interface Ctx {
  status: Status;
  session: Session | null;
  signup: (username: string, password: string, recoveryWords: string[]) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  recover: (username: string, words: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  flash: Flash;
  leftOnPurpose: boolean;
  clearFlash: () => void;
}
const AuthCtx = createContext<Ctx | null>(null);

function remember(username: string, masterKey: Uint8Array, csrf: string, s: Awaited<ReturnType<typeof sodium>>) {
  setCsrfToken(csrf);
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ u: username, k: toB64(s, masterKey) }));
  } catch {
    /* storage blocked: the session still works until the tab is reloaded */
  }
}
function forget() {
  setCsrfToken('');
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}

export function ReporterAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [leftOnPurpose, setLeftOnPurpose] = useState(false);

  // On reload: keep the session only if this tab still has the key AND the server session is alive.
  useEffect(() => {
    (async () => {
      const s = await sodium();
      let saved: { u: string; k: string } | null = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(STORE) ?? 'null');
      } catch {
        saved = null;
      }
      if (!saved) return setStatus('out');
      try {
        const me = await api<Bundle>('/reporter/me');
        setCsrfToken(me.csrfToken);
        setSession({ username: me.username, masterKey: fromB64(s, saved.k) });
        setStatus('in');
      } catch {
        forget();
        setStatus('out');
      }
    })();
  }, []);

  const finish = useCallback(async (b: Bundle, masterKey: Uint8Array) => {
    const s = await sodium();
    remember(b.username, masterKey, b.csrfToken, s);
    setSession({ username: b.username, masterKey });
    setLeftOnPurpose(false);
    setStatus('in');
  }, []);

  const signup: Ctx['signup'] = async (username, password, words) => {
    const { payload, masterKey } = await createAccountKeys(password, words.join(' '));
    const b = await api<Bundle>('/reporter/signup', { body: { username, ...payload } });
    setFlash('welcome');
    await finish(b, masterKey);
  };

  const login: Ctx['login'] = async (username, password) => {
    const { pwSalt } = await api<{ pwSalt: string }>('/reporter/prelogin', { body: { username } });
    const { authKey, wrapKey } = await deriveKeys(password, pwSalt);
    const b = await api<Bundle>('/reporter/login', { body: { username, authKey } });
    const masterKey = await open(wrapKey, b.masterKeyEnc);
    await finish(b, masterKey);
  };

  const recover: Ctx['recover'] = async (username, words, newPassword) => {
    const { recSalt } = await api<{ recSalt: string }>('/reporter/recover/start', { body: { username } });
    const rec = await deriveKeys(normalizePhrase(words), recSalt);
    const v = await api<{ masterKeyRecEnc: string; resetToken: string }>('/reporter/recover/verify', { body: { username, recAuthKey: rec.authKey } });
    const masterKey = await open(rec.wrapKey, v.masterKeyRecEnc);
    const next = await rewrapForPassword(newPassword, masterKey);
    const b = await api<Bundle>('/reporter/recover/reset', { body: { resetToken: v.resetToken, ...next } });
    setFlash('recovered');
    await finish(b, masterKey);
  };

  const logout = useCallback(async () => {
    try {
      await api('/reporter/logout', { method: 'POST' });
    } catch {
      /* already logged out on the server */
    }
    window.speechSynthesis?.cancel();
    forget();
    setLeftOnPurpose(true); // protected pages then go to the welcome page, not the login page
    setSession((old) => {
      old?.masterKey.fill(0);
      return null;
    });
    setStatus('out');
  }, []);

  return <AuthCtx.Provider value={{ status, session, signup, login, recover, logout, flash, leftOnPurpose, clearFlash: () => setFlash(null) }}>{children}</AuthCtx.Provider>;
}

export function useReporter() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useReporter outside provider');
  return c;
}

/** Locks the private space after 10 minutes without activity, with a warning at 9 minutes. */
export function useIdleLock() {
  const { status, logout } = useReporter();
  const [warning, setWarning] = useState(false);
  const last = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    if (status !== 'in') return;
    last.current = Date.now();
    const bump = () => {
      last.current = Date.now();
      setWarning(false);
      // Keep the server session alive while the person is active (at most once a minute).
      if (Date.now() - lastPing.current > 60_000) {
        lastPing.current = Date.now();
        api('/reporter/ping', { method: 'POST' }).catch(() => {});
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= IDLE_LOCK_MS) logout();
      else if (idle >= IDLE_WARN_MS) setWarning(true);
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [status, logout]);

  const stay = () => {
    last.current = Date.now();
    setWarning(false);
    api('/reporter/ping', { method: 'POST' }).catch(() => {});
  };
  return { warning, stay };
}
