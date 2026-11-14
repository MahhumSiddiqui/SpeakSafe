import { api } from './api';
import { fromB64, sodium, toB64 } from './keys';

// "Not alone" matching, browser side of an Oblivious PRF over ristretto255 (libsodium).
// 1. The ID is tidied and hashed to a point P on the curve.
// 2. P is hidden with a random number r (B = r·P) before it is sent: the server never sees P or the ID.
// 3. The server answers k·B using its secret key k. Removing r gives k·P.
// 4. The match token is a hash of the tidied ID and k·P. Same person → same token, for every reporter.

/** "iu 70332", "IU-70332" and "iu70332" all become "IU70332". */
export const normaliseId = (id: string) => id.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function matchToken(id: string): Promise<string> {
  const s = await sodium();
  const norm = normaliseId(id);
  if (norm.length < 3) throw new Error('shortId');
  const P = s.crypto_core_ristretto255_from_hash(s.crypto_generichash(64, `speaksafe-not-alone:${norm}`, null));
  const r = s.crypto_core_ristretto255_scalar_random();
  const blinded = s.crypto_scalarmult_ristretto255(r, P);
  const { evaluated } = await api<{ evaluated: string }>('/match/evaluate', { body: { blinded: toB64(s, blinded) } });
  const U = s.crypto_scalarmult_ristretto255(s.crypto_core_ristretto255_scalar_invert(r), fromB64(s, evaluated));
  r.fill(0);
  const label = new TextEncoder().encode(`speaksafe-match-token:${norm}:`);
  const input = new Uint8Array(label.length + U.length);
  input.set(label);
  input.set(U, label.length);
  return toB64(s, s.crypto_generichash(32, input, null));
}
