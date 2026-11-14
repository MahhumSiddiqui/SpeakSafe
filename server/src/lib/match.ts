import type { Prisma } from '@prisma/client';
import { audit } from './audit.js';

/**
 * Records a case's match token and releases every held report that names the same person.
 * Runs inside the submit transaction. Returns the IDs of reports that were released and how many other reports name the same person.
 */
export async function tagAndMatch(tx: Prisma.TransactionClient, caseId: string, token: string) {
  await tx.matchTag.create({ data: { caseId, token } });
  const others = await tx.matchTag.findMany({ where: { token, caseId: { not: caseId } }, select: { caseId: true } });
  if (!others.length) return { released: [] as string[], linked: 0 };
  const ids = [caseId, ...others.map((o) => o.caseId)];
  const held = await tx.case.findMany({ where: { id: { in: ids }, held: true }, select: { id: true } });
  if (held.length) await tx.case.updateMany({ where: { id: { in: held.map((h) => h.id) } }, data: { held: false, releasedAt: new Date() } });
  return { released: held.map((h) => h.id), linked: others.length };
}

export async function auditReleases(ids: string[], reason: 'match' | 'reporter') {
  for (const id of ids) await audit({ actorType: reason === 'match' ? 'SYSTEM' : 'REPORTER', action: 'CASE_RELEASED', targetType: 'CASE', targetId: id, details: { reason } });
}

/** IDs of the other cases whose reporters named the same person. */
export async function linkedCases(db: Prisma.TransactionClient, caseId: string) {
  const tag = await db.matchTag.findUnique({ where: { caseId } });
  if (!tag) return [];
  return (await db.matchTag.findMany({ where: { token: tag.token, caseId: { not: caseId } }, select: { caseId: true } })).map((t) => t.caseId);
}
