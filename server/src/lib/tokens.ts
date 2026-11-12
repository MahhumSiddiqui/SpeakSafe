import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (purpose: string, value: string) =>
  createHmac('sha256', config.SERVER_SECRET).update(`${purpose}:${value}`).digest();

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Short-lived signed token (used between the two steps of password recovery).
export function signToken(purpose: string, subject: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const body = `${subject}.${exp}`;
  const sig = hmac(purpose, body).toString('base64url');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

export function verifyToken(purpose: string, token: string): string | null {
  const [b, sig] = token.split('.');
  if (!b || !sig) return null;
  const body = Buffer.from(b, 'base64url').toString();
  if (!safeEqual(hmac(purpose, body).toString('base64url'), sig)) return null;
  const [subject, exp] = body.split('.');
  if (!subject || !exp || Number(exp) < Date.now()) return null;
  return subject;
}
