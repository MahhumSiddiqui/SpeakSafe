import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { canonicalJson } from './canonical.js';

// Tamper-evident, hash-chained audit log (FR-38, NFR-14, NFR-15).
export type ActorType = 'REPORTER' | 'HANDLER' | 'ADMIN' | 'SYSTEM';

export interface AuditEvent {
  actorType: ActorType;
  actorId?: string | null;
  action: string; // e.g. CASE_VIEWED, STATUS_CHANGED, LOGIN_SUCCESS
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}

const GENESIS = '0'.repeat(64);
const AUDIT_LOCK_KEY = 74225; // advisory lock so two writers cannot fork the chain

function computeHash(prevHash: string, at: Date, e: AuditEvent): string {
  const payload = [
    prevHash,
    at.toISOString(),
    e.actorType,
    e.actorId ?? '',
    e.action,
    e.targetType ?? '',
    e.targetId ?? '',
    canonicalJson(e.details ?? null),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export async function audit(event: AuditEvent): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS;
    const at = new Date();
    const hash = computeHash(prevHash, at, event);
    await tx.auditLog.create({
      data: {
        at,
        actorType: event.actorType,
        actorId: event.actorId ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        details: (event.details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        prevHash,
        hash,
      },
    });
  }, { maxWait: 15000, timeout: 20000 }); // Neon may need several seconds to wake from idle
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAtId?: string;
  reason?: string;
}

// Recompute the whole chain; report the first entry that does not match.
export async function verifyAuditChain(): Promise<VerifyResult> {
  let prevHash = GENESIS;
  let checked = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.prevHash !== prevHash) {
        return { ok: false, checked, brokenAtId: r.id.toString(), reason: 'previous-hash link broken' };
      }
      const expected = computeHash(prevHash, r.at, {
        actorType: r.actorType as ActorType,
        actorId: r.actorId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details: (r.details as Record<string, unknown> | null) ?? null,
      });
      if (expected !== r.hash) {
        return { ok: false, checked, brokenAtId: r.id.toString(), reason: 'entry content changed' };
      }
      prevHash = r.hash;
      checked++;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { ok: true, checked };
}
