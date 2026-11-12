import { Router } from 'express';
import { z } from 'zod';
import type { CaseStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireStaff } from '../lib/staffSession.js';
import { HttpError } from '../middleware/error.js';

// Committee case work. A member sees a case only if a key was sealed to them and they have not recused.
// The server never decrypts anything: it hands each member their own sealed key and the ciphertext.
export const staffCasesRouter = Router();
staffCasesRouter.use(requireStaff('HANDLER'));

const WAITING_DAYS = 7;
const b64 = (max: number) => z.string().min(16).max(max).regex(/^[A-Za-z0-9+/=]+$/, 'Invalid encoding');

async function readersOf(caseId: string) {
  const [keys, recusals] = await Promise.all([
    prisma.reportKey.findMany({ where: { caseId }, include: { handler: { select: { id: true, displayName: true, active: true } } } }),
    prisma.recusal.findMany({ where: { caseId }, select: { handlerId: true } }),
  ]);
  const out = new Set(recusals.map((r) => r.handlerId));
  return keys.filter((k) => !out.has(k.handlerId));
}

/** Loads a case only for a current reader; anyone else gets the same "not found". */
async function myCase(caseId: string, userId: string) {
  const readers = await readersOf(caseId);
  const mine = readers.find((k) => k.handlerId === userId);
  if (!mine) throw new HttpError(404, 'This case is not assigned to you.');
  const c = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { category: true } });
  return { c, mine, readers };
}

const touch = (id: string) => prisma.case.update({ where: { id }, data: { lastHandlerActionAt: new Date() } });

staffCasesRouter.get('/', async (req, res, next) => {
  try {
    const me = req.staff!.userId;
    const recused = (await prisma.recusal.findMany({ where: { handlerId: me }, select: { caseId: true } })).map((r) => r.caseId);
    const cases = await prisma.case.findMany({
      where: { keys: { some: { handlerId: me } }, id: { notIn: recused } },
      include: { category: { select: { name: true } }, closures: { where: { status: 'PENDING' }, select: { requestedById: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    const now = Date.now();
    res.json(cases.map((c) => {
      const last = (c.lastHandlerActionAt ?? c.submittedAt).getTime();
      return {
        id: c.id, category: c.category.name, mode: c.mode, status: c.status, aboutOther: c.aboutOther,
        submittedAt: c.submittedAt, lastActionAt: c.lastHandlerActionAt,
        waiting: c.status !== 'CLOSED' && now - last > WAITING_DAYS * 86_400_000,
        needsMyApproval: c.closures.some((x) => x.requestedById !== me),
      };
    }));
  } catch (e) {
    next(e);
  }
});

staffCasesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const me = req.staff!.userId;
    const { c, mine, readers } = await myCase(id, me);
    // Every opening of a case is recorded (FR: who viewed what, and when).
    await audit({ actorType: 'HANDLER', actorId: me, action: 'CASE_VIEWED', targetType: 'CASE', targetId: id });
    const [attachments, notes, closures, events] = await Promise.all([
      prisma.attachment.findMany({ where: { caseId: id }, select: { id: true, kind: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.caseNote.findMany({ where: { caseId: id }, include: { handler: { select: { displayName: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.closureApproval.findMany({ where: { caseId: id }, include: { requestedBy: { select: { displayName: true } }, approvedBy: { select: { displayName: true } } }, orderBy: { requestedAt: 'desc' } }),
      prisma.auditLog.findMany({ where: { targetType: 'CASE', targetId: id }, orderBy: { id: 'desc' }, take: 50 }),
    ]);
    const names = new Map((await prisma.user.findMany({ where: { id: { in: events.map((e) => e.actorId).filter(Boolean) as string[] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    res.json({
      id: c.id, category: c.category.name, mode: c.mode, status: c.status, aboutOther: c.aboutOther,
      submittedAt: c.submittedAt, lastActionAt: c.lastHandlerActionAt,
      nonce: c.nonce, ciphertext: c.ciphertext, fingerprint: c.fingerprint,
      sealedKey: mine.sealedKey,
      readers: readers.map((r) => ({ id: r.handlerId, displayName: r.handler.displayName, me: r.handlerId === me })),
      attachments,
      notes: notes.map((n) => ({ id: n.id, by: n.handler.displayName, mine: n.handlerId === me, nonce: n.nonce, ciphertext: n.ciphertext, createdAt: n.createdAt })),
      closures: closures.map((x) => ({ id: x.id, status: x.status, requestedBy: x.requestedBy.displayName, requestedByMe: x.requestedById === me, approvedBy: x.approvedBy?.displayName ?? null, requestedAt: x.requestedAt, decidedAt: x.decidedAt })),
      activity: events.map((e) => ({ at: e.at, action: e.action, by: e.actorId ? names.get(e.actorId) ?? 'Committee member' : e.actorType === 'REPORTER' ? 'Reporter' : 'System', details: e.details })),
    });
  } catch (e) {
    next(e);
  }
});

staffCasesRouter.get('/:id/attachments/:aid', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await myCase(id, req.staff!.userId);
    const a = await prisma.attachment.findFirst({ where: { id: String(req.params.aid), caseId: id } });
    if (!a) throw new HttpError(404, 'File not found.');
    await audit({ actorType: 'HANDLER', actorId: req.staff!.userId, action: 'ATTACHMENT_OPENED', targetType: 'CASE', targetId: id, details: { kind: a.kind } });
    res.type('application/octet-stream').send(Buffer.concat([Buffer.from(a.nonce, 'base64'), Buffer.from(a.ciphertext)]));
  } catch (e) {
    next(e);
  }
});

const WORK_STATUSES = ['RECEIVED', 'UNDER_REVIEW', 'INQUIRY'] as const;

staffCasesRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { status } = z.object({ status: z.enum(WORK_STATUSES) }).parse(req.body);
    const { c } = await myCase(id, req.staff!.userId);
    if (c.status === 'CLOSED' || c.status === 'PENDING_CLOSURE') throw new HttpError(409, 'This case is closing or closed. Its status cannot be changed here.');
    if (c.status === status) return res.json({ status });
    await prisma.case.update({ where: { id }, data: { status, lastHandlerActionAt: new Date() } });
    await audit({ actorType: 'HANDLER', actorId: req.staff!.userId, action: 'STATUS_CHANGED', targetType: 'CASE', targetId: id, details: { from: c.status, to: status } });
    res.json({ status, previous: c.status });
  } catch (e) {
    next(e);
  }
});

// Private notes: encrypted in the browser with the case key, add-only (no edit or delete exists, and the database forbids it).
staffCasesRouter.post('/:id/notes', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const b = z.object({ nonce: b64(64), ciphertext: b64(100_000) }).parse(req.body);
    await myCase(id, req.staff!.userId);
    const n = await prisma.caseNote.create({ data: { caseId: id, handlerId: req.staff!.userId, nonce: b.nonce, ciphertext: b.ciphertext, keys: {} } });
    await touch(id);
    await audit({ actorType: 'HANDLER', actorId: req.staff!.userId, action: 'NOTE_ADDED', targetType: 'CASE', targetId: id });
    res.status(201).json({ id: n.id, createdAt: n.createdAt });
  } catch (e) {
    next(e);
  }
});

// Recusal: the member hands the case to someone else (lightest workload, never an excluded member),
// by sealing the case key to that person in their own browser. Then they lose access.
async function candidateFor(caseId: string, me: string) {
  const [keys, excl, rec] = await Promise.all([
    prisma.reportKey.findMany({ where: { caseId }, select: { handlerId: true } }),
    prisma.exclusion.findMany({ where: { caseId }, select: { handlerId: true } }),
    prisma.recusal.findMany({ where: { caseId }, select: { handlerId: true } }),
  ]);
  const blocked = new Set([me, ...keys.map((k) => k.handlerId), ...excl.map((x) => x.handlerId), ...rec.map((r) => r.handlerId)]);
  const pool = await prisma.user.findMany({
    where: { role: 'HANDLER', active: true, publicKey: { not: null }, id: { notIn: [...blocked] } },
    select: { id: true, displayName: true, publicKey: true, reportKeys: { where: { case: { status: { not: 'CLOSED' } } }, select: { id: true } } },
  });
  pool.sort((a, b) => a.reportKeys.length - b.reportKeys.length);
  return pool[0] ?? null;
}

staffCasesRouter.get('/:id/recuse-candidate', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await myCase(id, req.staff!.userId);
    const c = await candidateFor(id, req.staff!.userId);
    if (!c) throw new HttpError(409, 'There is no other committee member who can take this case. Please contact the administrator.');
    res.json({ id: c.id, displayName: c.displayName, publicKey: c.publicKey });
  } catch (e) {
    next(e);
  }
});

staffCasesRouter.post('/:id/recuse', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const me = req.staff!.userId;
    const b = z.object({ newReaderId: z.string().uuid(), sealedKey: b64(256) }).parse(req.body);
    const { c } = await myCase(id, me);
    const cand = await candidateFor(id, me);
    if (!cand || cand.id !== b.newReaderId) throw new HttpError(409, 'The committee changed in the meantime. Please try again.');
    await prisma.$transaction(async (tx) => {
      await tx.reportKey.create({ data: { caseId: id, handlerId: cand.id, sealedKey: b.sealedKey } });
      await tx.recusal.create({ data: { caseId: id, handlerId: me } });
      if (c.assignedHandlerId === me) await tx.case.update({ where: { id }, data: { assignedHandlerId: cand.id } });
    });
    await audit({ actorType: 'HANDLER', actorId: me, action: 'RECUSED', targetType: 'CASE', targetId: id, details: { handedTo: cand.displayName } });
    res.json({ ok: true, handedTo: cand.displayName });
  } catch (e) {
    next(e);
  }
});

// Two-person closure: one member requests, a different current reader must approve.
staffCasesRouter.post('/:id/closure', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const me = req.staff!.userId;
    const { c } = await myCase(id, me);
    if (c.status === 'CLOSED' || c.status === 'PENDING_CLOSURE') throw new HttpError(409, 'Closure has already been requested or done.');
    await prisma.$transaction([
      prisma.closureApproval.create({ data: { caseId: id, requestedById: me, previousStatus: c.status } }),
      prisma.case.update({ where: { id }, data: { status: 'PENDING_CLOSURE', lastHandlerActionAt: new Date() } }),
    ]);
    await audit({ actorType: 'HANDLER', actorId: me, action: 'CLOSURE_REQUESTED', targetType: 'CASE', targetId: id });
    res.status(201).json({ status: 'PENDING_CLOSURE' });
  } catch (e) {
    next(e);
  }
});

staffCasesRouter.post('/:id/closure/:cid/decision', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const me = req.staff!.userId;
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    await myCase(id, me);
    const cl = await prisma.closureApproval.findFirst({ where: { id: String(req.params.cid), caseId: id, status: 'PENDING' } });
    if (!cl) throw new HttpError(404, 'There is no pending closure request.');
    if (cl.requestedById === me) throw new HttpError(403, 'A second committee member must decide on your closure request.');
    const next: CaseStatus = approve ? 'CLOSED' : cl.previousStatus;
    await prisma.$transaction([
      prisma.closureApproval.update({ where: { id: cl.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: me, decidedAt: new Date() } }),
      prisma.case.update({ where: { id }, data: { status: next, lastHandlerActionAt: new Date() } }),
    ]);
    await audit({ actorType: 'HANDLER', actorId: me, action: approve ? 'CASE_CLOSED' : 'CLOSURE_REJECTED', targetType: 'CASE', targetId: id });
    res.json({ status: next });
  } catch (e) {
    next(e);
  }
});
