import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

// Server-side encryption at rest (AES-256-GCM) for secrets the server itself must use, like TOTP seeds.
const key = Buffer.from(hkdfSync('sha256', config.SERVER_SECRET, 'speaksafe', 'totp-secret-at-rest', 32));

export function encryptAtRest(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decryptAtRest(b64: string): string {
  const all = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, all.subarray(0, 12));
  d.setAuthTag(all.subarray(12, 28));
  return Buffer.concat([d.update(all.subarray(28)), d.final()]).toString('utf8');
}
