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
