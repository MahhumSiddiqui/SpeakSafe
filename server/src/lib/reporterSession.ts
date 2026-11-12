import type { Request, RequestHandler, Response } from 'express';
import { prisma } from '../db.js';
import { isProd } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { randomToken, safeEqual, sha256 } from './tokens.js';

export const REPORTER_COOKIE = 'ss_rep';
const IDLE_MS = 30 * 60 * 1000; // server-side idle limit (the browser locks itself sooner, after 10 minutes)
const MAX_MS = 12 * 60 * 60 * 1000; // absolute session lifetime

export async function startReporterSession(res: Response, accountId: string) {
  const token = randomToken();
  const csrfToken = randomToken(24);
  await prisma.reporterSession.create({
    data: { id: sha256(token), accountId, csrfToken, expiresAt: new Date(Date.now() + MAX_MS) },
  });
  res.cookie(REPORTER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    path: '/api',
    maxAge: MAX_MS,
  });
  return csrfToken;
}

export async function endReporterSession(req: Request, res: Response) {
  const token = req.cookies?.[REPORTER_COOKIE];
  if (token) await prisma.reporterSession.deleteMany({ where: { id: sha256(token) } });
  res.clearCookie(REPORTER_COOKIE, { path: '/api' });
}

declare module 'express-serve-static-core' {
  interface Request {
    reporter?: { accountId: string; sessionId: string };
  }
}

// Requires a valid, non-idle reporter session. State-changing requests must also carry the CSRF token.
export const requireReporter: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[REPORTER_COOKIE];
    if (!token) throw new HttpError(401, 'Please log in to your private space.');
    const id = sha256(token);
    const s = await prisma.reporterSession.findUnique({ where: { id } });
    const now = Date.now();
    if (!s || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > IDLE_MS) {
      if (s) await prisma.reporterSession.deleteMany({ where: { id } });
      throw new HttpError(401, 'Your private space was locked. Please log in again.');
    }
    if (req.method !== 'GET' && !safeEqual(String(req.get('X-CSRF-Token') ?? ''), s.csrfToken)) {
      throw new HttpError(403, 'This request could not be verified. Please reload the page.');
    }
    await prisma.reporterSession.update({ where: { id }, data: { lastSeenAt: new Date() } });
    req.reporter = { accountId: s.accountId, sessionId: id };
    next();
  } catch (e) {
    next(e);
  }
};
