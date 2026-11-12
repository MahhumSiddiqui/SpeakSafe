import _sodium from 'libsodium-wrappers-sumo';

// All key handling happens here, in the browser. The server never receives a password,
// recovery words, the master key or any secret key: only an auth key and ciphertext.
export type Sodium = typeof _sodium;
let ready: Promise<Sodium> | null = null;
export function sodium(): Promise<Sodium> {
  ready ??= _sodium.ready.then(() => _sodium);
  return ready;
}

const V = () => _sodium.base64_variants.ORIGINAL;
export const toB64 = (s: Sodium, u: Uint8Array) => s.to_base64(u, V());
export const fromB64 = (s: Sodium, b: string) => s.from_base64(b, V());

// Let the browser paint a "working" state before the deliberately slow Argon2id step.
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

/** Argon2id (libsodium "interactive" cost: 64 MiB, 2 passes) → two independent 32-byte keys. */
export async function deriveKeys(secret: string, saltB64: string) {
  const s = await sodium();
  await nextFrame();
  const root = s.crypto_pwhash(
    32,
    secret.normalize('NFKC'),
    fromB64(s, saltB64),
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
  const auth = s.crypto_kdf_derive_from_key(32, 1, 'ss_auth_', root);
  const wrap = s.crypto_kdf_derive_from_key(32, 2, 'ss_wrap_', root);
  s.memzero(root);
  return { authKey: toB64(s, auth), wrapKey: wrap };
}

/** XSalsa20-Poly1305 (secretbox). Output: base64(nonce || ciphertext). */
export async function seal(key: Uint8Array, msg: Uint8Array): Promise<string> {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(msg, nonce, key);
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce);
  out.set(ct, nonce.length);
  return toB64(s, out);
}

export async function open(key: Uint8Array, boxB64: string): Promise<Uint8Array> {
  const s = await sodium();
  const all = fromB64(s, boxB64);
  const n = s.crypto_secretbox_NONCEBYTES;
  return s.crypto_secretbox_open_easy(all.subarray(n), all.subarray(0, n), key); // throws if tampered or wrong key
}

export const normalizePhrase = (p: string) => p.trim().toLowerCase().split(/\s+/).join(' ');

/** Everything needed to create a private space. Returns the server payload and the unlocked master key. */
export async function createAccountKeys(password: string, recoveryPhrase: string) {
  const s = await sodium();
  const masterKey = s.randombytes_buf(32);
  const kp = s.crypto_box_keypair();
  const pwSalt = toB64(s, s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
  const recSalt = toB64(s, s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
  const pw = await deriveKeys(password, pwSalt);
  const rec = await deriveKeys(normalizePhrase(recoveryPhrase), recSalt);
  const payload = {
    pwSalt,
    authKey: pw.authKey,
    masterKeyEnc: await seal(pw.wrapKey, masterKey),
    recSalt,
    recAuthKey: rec.authKey,
    masterKeyRecEnc: await seal(rec.wrapKey, masterKey),
    publicKey: toB64(s, kp.publicKey),
    secretKeyEnc: await seal(masterKey, kp.privateKey),
  };
  s.memzero(kp.privateKey);
  return { payload, masterKey };
}

/** New password for an already unlocked master key (used after recovery). */
export async function rewrapForPassword(password: string, masterKey: Uint8Array) {
  const s = await sodium();
  const pwSalt = toB64(s, s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
  const pw = await deriveKeys(password, pwSalt);
  return { pwSalt, authKey: pw.authKey, masterKeyEnc: await seal(pw.wrapKey, masterKey) };
}
