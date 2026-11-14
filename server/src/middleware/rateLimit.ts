import rateLimit from 'express-rate-limit';
import { hmac } from '../lib/tokens.js';

// Limits are counted per hashed IP, kept only in memory and only for the window (no IP is stored or logged).
const key = (req: { ip?: string }) => hmac('ratelimit', req.ip ?? 'unknown').toString('hex');

const make = (windowMinutes: number, limit: number, message: string) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: key,
    message: { error: message },
  });

// Slows guessing without ever locking an account for good.
export const authLimiter = make(15, 20, 'Too many attempts. Please wait a few minutes and try again.');
export const signupLimiter = make(60, 10, 'Too many new spaces were created from this connection. Please try again later.');

// "Not alone" match tokens: each token request is a guess an attacker could use to test IDs, so they are
// limited per private space and per connection (both counted only in memory, as hashes).
export const matchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => hmac('ratelimit-match', (req as { reporter?: { accountId: string } }).reporter?.accountId ?? key(req)).toString('hex'),
  message: { error: 'Too many requests for a match check. Please try again in an hour.' },
});
export const matchIpLimiter = make(60, 30, 'Too many requests for a match check. Please try again in an hour.');
