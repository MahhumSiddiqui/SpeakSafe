import type { Request } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { safeEqual, sha256 } from './tokens.js';

// The reporter's browser proves it owns a case with a per-case key derived from the account's master key.
// The server stores only SHA-256 of that key, so the database holds no link between account and case.
export const caseVerifier = (caseAuthKey: string) => sha256(`case-auth:${caseAuthKey}`);

export async function requireCaseAuth(req: Request, caseId: string) {
  const key = String(req.get('X-Case-Auth') ?? '');
  const access = await prisma.caseAccess.findUnique({ where: { caseId } });
  // Same answer whether the case is missing or the key is wrong.
  if (!key || !access || !safeEqual(caseVerifier(key), access.authVerifier)) {
    throw new HttpError(404, 'We could not find that case.');
  }
  return access;
}
