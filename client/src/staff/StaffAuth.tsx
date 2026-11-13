import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, setCsrfToken } from '../lib/api';
import { deriveKeys, fromB64, open, seal, sodium, toB64 } from '../lib/keys';

// Committee / admin session. A member's private key is unlocked in the browser with their password
// (Argon2id) and kept only in this tab; the server only ever has it encrypted.
export interface StaffMe {
  id: string; email: string; displayName: string; role: 'HANDLER' | 'ADMIN';
  publicKey: string | null; encryptedPrivateKey: string | null; keySalt: string | null;
  needsKeys: boolean; recoveryCodesLeft: number; csrfToken: string; mustChangePassword: boolean;
}
type Status = 'loading' | 'in' | 'out';
const STORE = 'ss.staff';
export const STAFF_IDLE_MS = 15 * 60 * 1000;
const WARN_MS = 14 * 60 * 1000;

interface Ctx {
  status: Status;
  me: StaffMe | null;
  keys: { publicKey: Uint8Array; privateKey: Uint8Array } | null;
  /** Finishes sign-in: unlocks (or, for a new member, creates) the key pair with the password. */
  complete: (me: StaffMe, password: string) => Promise<void>;
  logout: (reason?: 'idle') => Promise<void>;
  signedOutIdle: boolean;
  setMe: (m: StaffMe) => void;
}
const C = createContext<Ctx | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<StaffMe | null>(null);
  const [keys, setKeys] = useState<Ctx['keys']>(null);
  const [signedOutIdle, setIdle] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await sodium();
      let saved: { k?: string } | null = null;
      try { saved = JSON.parse(sessionStorage.getItem(STORE) ?? 'null'); } catch { saved = null; }
      if (!saved) return setStatus('out');
      try {
        const m = await api<StaffMe>('/staff/me');
        setCsrfToken(m.csrfToken);
        setMe(m);
        if (saved.k && m.publicKey) setKeys({ publicKey: fromB64(s, m.publicKey), privateKey: fromB64(s, saved.k) });
        setStatus('in');
      } catch {
        sessionStorage.removeItem(STORE);
        setStatus('out');
      }
    })();
  }, []);

  const complete: Ctx['complete'] = async (m, password) => {
    const s = await sodium();
    setCsrfToken(m.csrfToken);
    let k: Ctx['keys'] = null;
    let current = m;
    if (m.role === 'HANDLER') {
      if (m.needsKeys) {
        // First sign-in: create the member's key pair here, in their browser.
        const kp = s.crypto_box_keypair();
        const keySalt = toB64(s, s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
        const { wrapKey } = await deriveKeys(password, keySalt);
        const encryptedPrivateKey = await seal(wrapKey, kp.privateKey);
        await api('/staff/keys', { body: { publicKey: toB64(s, kp.publicKey), encryptedPrivateKey, keySalt } });
        k = { publicKey: kp.publicKey, privateKey: kp.privateKey };
        current = { ...m, needsKeys: false, publicKey: toB64(s, kp.publicKey) };
      } else if (m.encryptedPrivateKey && m.keySalt && m.publicKey) {
        const { wrapKey } = await deriveKeys(password, m.keySalt);
        k = { publicKey: fromB64(s, m.publicKey), privateKey: await open(wrapKey, m.encryptedPrivateKey) };
      }
    }
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ k: k ? toB64(s, k.privateKey) : undefined }));
    } catch { /* storage blocked */ }
    setKeys(k);
    setMe(current);
    setIdle(false);
    setStatus('in');
  };

  const logout = useCallback(async (reason?: 'idle') => {
    try { await api('/staff/logout', { method: 'POST' }); } catch { /* already gone */ }
    try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
    setCsrfToken('');
    setKeys((old) => { old?.privateKey.fill(0); return null; });
    setMe(null);
    setIdle(reason === 'idle');
    setStatus('out');
  }, []);

  return <C.Provider value={{ status, me, keys, complete, logout, signedOutIdle, setMe }}>{children}</C.Provider>;
}

export function useStaff() {
  const c = useContext(C);
  if (!c) throw new Error('useStaff outside provider');
  return c;
}

/** 15-minute idle sign-out with a one-minute warning (NFR). */
export function useStaffIdle() {
  const { status, logout } = useStaff();
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());
  const lastPing = useRef(Date.now());
  useEffect(() => {
    if (status !== 'in') return;
    last.current = Date.now();
    const bump = () => {
      last.current = Date.now();
      setWarn(false);
      if (Date.now() - lastPing.current > 60_000) {
        lastPing.current = Date.now();
        api('/staff/ping', { method: 'POST' }).catch(() => {});
      }
    };
    const ev = ['pointerdown', 'keydown', 'scroll'] as const;
    ev.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= STAFF_IDLE_MS) logout('idle');
      else if (idle >= WARN_MS) setWarn(true);
    }, 5000);
    return () => { ev.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [status, logout]);
  const stay = () => { last.current = Date.now(); setWarn(false); api('/staff/ping', { method: 'POST' }).catch(() => {}); };
  return { warn, stay };
}
