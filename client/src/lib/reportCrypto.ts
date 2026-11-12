import { fromB64, open, seal, sodium, toB64 } from './keys';

// End-to-end encryption for reports. Everything here runs in the reporter's browser.
//  - A fresh random content key encrypts the report and every file (XSalsa20-Poly1305).
//  - The content key is sealed (X25519 sealed box) to each assigned committee member and to the reporter.
//  - Per-case keys come from the account master key + a random case reference, so the server
//    never learns which account a case belongs to.

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function caseKeys(masterKey: Uint8Array, caseRef: string) {
  const s = await sodium();
  const seed = s.crypto_generichash(32, enc.encode(`speaksafe-case:${caseRef}`), masterKey);
  const kp = s.crypto_box_seed_keypair(s.crypto_kdf_derive_from_key(32, 1, 'ss_case_', seed));
  const auth = s.crypto_kdf_derive_from_key(32, 2, 'ss_case_', seed);
  s.memzero(seed);
  return { publicKey: kp.publicKey, privateKey: kp.privateKey, authKey: toB64(s, auth) };
}

export async function newCaseRef() {
  const s = await sodium();
  return toB64(s, s.randombytes_buf(16));
}

/** Encrypts the report; returns the parts the server stores plus the content key for the files. */
export async function encryptReport(report: unknown, readers: { id: string; publicKey: string }[], reporterPublicKey: Uint8Array) {
  const s = await sodium();
  const contentKey = s.crypto_secretbox_keygen();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(enc.encode(JSON.stringify(report)), nonce, contentKey);
  const stored = new Uint8Array(nonce.length + ct.length);
  stored.set(nonce);
  stored.set(ct, nonce.length);
  const sealedKeys = Object.fromEntries(readers.map((r) => [r.id, toB64(s, s.crypto_box_seal(contentKey, fromB64(s, r.publicKey)))]));
  return {
    contentKey,
    nonce: toB64(s, nonce),
    ciphertext: toB64(s, ct),
    fingerprint: s.to_hex(s.crypto_hash_sha256(stored)),
    sealedKeys,
    reporterSealedKey: toB64(s, s.crypto_box_seal(contentKey, reporterPublicKey)),
  };
}

export async function openContentKey(sealedB64: string, publicKey: Uint8Array, privateKey: Uint8Array) {
  const s = await sodium();
  return s.crypto_box_seal_open(fromB64(s, sealedB64), publicKey, privateKey);
}

export async function decryptReport<T>(contentKey: Uint8Array, nonceB64: string, ctB64: string): Promise<T> {
  const s = await sodium();
  const pt = s.crypto_secretbox_open_easy(fromB64(s, ctB64), fromB64(s, nonceB64), contentKey);
  return JSON.parse(dec.decode(pt)) as T;
}

/** Files: output is nonce || ciphertext (raw bytes). */
export async function encryptBytes(key: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(bytes, nonce, key);
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce);
  out.set(ct, nonce.length);
  return out;
}

export async function decryptBytes(key: Uint8Array, box: Uint8Array): Promise<Uint8Array> {
  const s = await sodium();
  const n = s.crypto_secretbox_NONCEBYTES;
  return s.crypto_secretbox_open_easy(box.subarray(n), box.subarray(0, n), key);
}

export const sealJson = async (key: Uint8Array, v: unknown) => seal(key, enc.encode(JSON.stringify(v)));
export const openJson = async <T,>(key: Uint8Array, b: string): Promise<T> => JSON.parse(dec.decode(await open(key, b))) as T;
