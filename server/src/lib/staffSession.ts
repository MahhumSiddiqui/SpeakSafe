import type { Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { isProd } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { randomToken, safeEqual, sha256 } from './tokens.js';

export const STAFF_COOKIE = 'ss_staff';
export const STAFF_IDLE_MS = 15 * 60 * 1000; // NFR: 15-minute idle timeout for committee and admin
const MAX_MS = 10 * 60 * 60 * 1000;

export async function startStaffSession(res: Response, userId: string) {
  const token = randomToken();
  const csrfToken = randomToken(24);
  await prisma.session.create({ data: { id: sha256(token), userId, csrfToken, expiresAt: new Date(Date.now() + MAX_MS) } });
  res.cookie(STAFF_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: isProd, path: '/api', maxAge: MAX_MS });
  return csrfToken;
}

export async function endStaffSession(req: Request, res: Response) {
  const token = req.cookies?.[STAFF_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  res.clearCookie(STAFF_COOKIE, { path: '/api' });
}

declare module 'express-serve-static-core' {
  interface Request {
    staff?: { userId: string; role: Role; sessionId: string; displayName: string };
  }
}

export function requireStaff(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[STAFF_COOKIE];
      if (!token) throw new HttpError(401, 'Please sign in.');
      const id = sha256(token);
      const s = await prisma.session.findUnique({ where: { id }, include: { user: true } });
      const now = Date.now();
      if (!s || !s.user.active || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > STAFF_IDLE_MS) {
        if (s) await prisma.session.deleteMany({ where: { id } });
        throw new HttpError(401, 'You were signed out after 15 minutes without activity. Please sign in again.');
      }
      if (roles.length && !roles.includes(s.user.role)) throw new HttpError(403, 'Your account cannot do this.');
      if (req.method !== 'GET' && !safeEqual(String(req.get('X-CSRF-Token') ?? ''), s.csrfToken)) {
        throw new HttpError(403, 'This request could not be verified. Please reload the page.');
      }
      await prisma.session.update({ where: { id }, data: { lastSeenAt: new Date() } });
      req.staff = { userId: s.userId, role: s.user.role, sessionId: id, displayName: s.user.displayName };
      next();
    } catch (e) {
      next(e);
    }
  };
}
