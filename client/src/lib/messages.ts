import { fromB64, sodium, toB64 } from './keys';

// Case conversation: each message is encrypted with the case's content key, which only the reporter
// and the case's current readers hold. The server stores ciphertext it cannot read.
export interface MessagePayload { text: string; voice?: { id: string; seconds: number } }
export interface RawMessage { id: string; nonce: string; ciphertext: string; createdAt: string }

export async function encryptMessage(contentKey: Uint8Array, p: MessagePayload) {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(new TextEncoder().encode(JSON.stringify(p)), nonce, contentKey);
  return { nonce: toB64(s, nonce), ciphertext: toB64(s, ct) };
}

export async function decryptMessage(contentKey: Uint8Array, m: RawMessage): Promise<MessagePayload> {
  const s = await sodium();
  try {
    return JSON.parse(new TextDecoder().decode(s.crypto_secretbox_open_easy(fromB64(s, m.ciphertext), fromB64(s, m.nonce), contentKey)));
  } catch {
    return { text: '' };
  }
}
