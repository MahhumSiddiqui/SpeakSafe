import { fromB64, sodium, toB64 } from '../lib/keys';
import { decryptBytes, decryptReport } from '../lib/reportCrypto';
import { getBytes } from '../lib/binary';

// Committee-side decryption. All of it happens in the member's browser.
export async function openCaseKey(sealedKey: string, keys: { publicKey: Uint8Array; privateKey: Uint8Array }) {
  const s = await sodium();
  return s.crypto_box_seal_open(fromB64(s, sealedKey), keys.publicKey, keys.privateKey);
}

/** Recomputes the tamper-proof seal (SHA-256 of nonce + ciphertext) and compares it with the stored one. */
export async function sealMatches(nonce: string, ciphertext: string, fingerprint: string) {
  const s = await sodium();
  const n = fromB64(s, nonce);
  const c = fromB64(s, ciphertext);
  const all = new Uint8Array(n.length + c.length);
  all.set(n);
  all.set(c, n.length);
  return s.to_hex(s.crypto_hash_sha256(all)) === fingerprint;
}

export const decryptCase = decryptReport;

export async function encryptNote(contentKey: Uint8Array, text: string) {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(new TextEncoder().encode(text), nonce, contentKey);
  return { nonce: toB64(s, nonce), ciphertext: toB64(s, ct) };
}

export async function decryptNote(contentKey: Uint8Array, nonce: string, ciphertext: string) {
  const s = await sodium();
  return new TextDecoder().decode(s.crypto_secretbox_open_easy(fromB64(s, ciphertext), fromB64(s, nonce), contentKey));
}

export async function sealKeyFor(contentKey: Uint8Array, publicKeyB64: string) {
  const s = await sodium();
  return toB64(s, s.crypto_box_seal(contentKey, fromB64(s, publicKeyB64)));
}

export async function fetchStaffAttachment(caseId: string, aid: string, contentKey: Uint8Array) {
  return decryptBytes(contentKey, await getBytes(`/staff/cases/${caseId}/attachments/${aid}`));
}
