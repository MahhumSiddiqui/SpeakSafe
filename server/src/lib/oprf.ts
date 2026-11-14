import { hkdfSync } from 'node:crypto';
import _sodium from 'libsodium-wrappers-sumo';
import { config } from '../config.js';

// "Not alone" matching with an Oblivious PRF over ristretto255 (libsodium).
// The browser sends B = r·H(id), a point blinded with a random r. The server returns k·B.
// The browser removes r and gets k·H(id), from which it derives the match token.
// The server never sees the ID, and nobody can compute a token without the server key k.
// k is derived from SERVER_SECRET (an environment variable), so it is never stored in the database.
let key: Uint8Array | null = null;

async function serverKey() {
  await _sodium.ready;
  if (!key) {
    const wide = new Uint8Array(hkdfSync('sha256', config.SERVER_SECRET, 'speaksafe', 'not-alone-oprf-key', 64));
    key = _sodium.crypto_core_ristretto255_scalar_reduce(wide);
  }
  return { sodium: _sodium, k: key };
}

/** Returns k·B for a valid blinded point B, or null if the input is not a valid ristretto255 point. */
export async function evaluateBlinded(blinded: Uint8Array): Promise<Uint8Array | null> {
  const { sodium, k } = await serverKey();
  if (blinded.length !== sodium.crypto_core_ristretto255_BYTES || !sodium.crypto_core_ristretto255_is_valid_point(blinded)) return null;
  try {
    return sodium.crypto_scalarmult_ristretto255(k, blinded);
  } catch {
    return null; // identity element
  }
}
