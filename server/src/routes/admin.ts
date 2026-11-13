import { Router } from 'express';
import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit, verifyAuditChain } from '../lib/audit.js';
import { requireStaff } from '../lib/staffSession.js';
import { HttpError } from '../middleware/error.js';

// Admin console. The admin manages accounts, categories and the audit log, and sees counts only.
// Nothing here returns report content, keys or messages: the admin cannot read any report (separation of duties).
export const adminRouter = Router();
adminRouter.use(requireStaff('ADMIN'));

const ARGON = { type: argon2.argon2id } as const;
const SMALL = 5; // any count from 1 to 4 is hidden in statistics (small-group re-identification)
const A = 'abcdefghjkmnpqrstuvwxyz23456789';
const oneTimePassword = () => Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join('')).join('-');

/** Open cases where this member is one of only two (or fewer) current readers. */
async function casesThatNeed(userId: string) {
  const keys = await prisma.reportKey.findMany({ where: { handlerId: userId, case: { status: { not: 'CLOSED' } } }, select: { caseId: true } });
  let blocked = 0;
  for (const { caseId } of keys) {
    const [all, recused] = await Promise.all([
      prisma.reportKey.findMany({ where: { caseId }, select: { handlerId: true, handler: { select: { active: true } } } }),
      prisma.recusal.findMany({ where: { caseId }, select: { handlerId: true } }),
    ]);
    if (recused.some((r) => r.handlerId === userId)) continue;
    const out = new Set(recused.map((r) => r.handlerId));
    const others = all.filter((k) => k.handlerId !== userId && !out.has(k.handlerId) && k.handler.active).length;
    if (others < 2) blocked++;
  }
  return blocked;
}

// ---------- Accounts ----------
adminRouter.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ include: { mfa: { select: { confirmed: true, recoveryCodes: true } } }, orderBy: [{ role: 'asc' }, { displayName: 'asc' }] });
    const openLoad = await prisma.reportKey.groupBy({ by: ['handlerId'], where: { case: { status: { not: 'CLOSED' } } }, _count: { _all: true } });
    const load = new Map(openLoad.map((l) => [l.handlerId, l._count._all]));
    res.json(users.map((u) => ({
      id: u.id, email: u.email, displayName: u.displayName, role: u.role, active: u.active,
      mfa: u.mfa?.confirmed ? 'on' : 'not set up', recoveryCodesLeft: u.mfa?.recoveryCodes.length ?? 0,
      hasKeys: !!u.publicKey, lastLoginAt: u.lastLoginAt, mustChangePassword: u.mustChangePassword,
      openCases: load.get(u.id) ?? 0,
    })));
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/users', async (req, res, next) => {
  try {
    const b = z.object({
      email: z.string().trim().toLowerCase().email('Please enter a valid email.').max(200),
      displayName: z.string().trim().min(2, 'Please enter a name.').max(80),
      role: z.enum(['HANDLER', 'ADMIN']),
    }).parse(req.body);
    if (await prisma.user.findUnique({ where: { email: b.email } })) throw new HttpError(409, 'An account with this email already exists.');
    const temporaryPassword = oneTimePassword();
    const u = await prisma.user.create({ data: { ...b, passwordHash: await argon2.hash(temporaryPassword, ARGON), mustChangePassword: true } });
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: 'USER_CREATED', targetType: 'USER', targetId: u.id, details: { role: b.role } });
    res.status(201).json({ id: u.id, temporaryPassword });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/users/:id/active', async (req, res, next) => {
  try {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const id = String(req.params.id);
    if (id === req.staff!.userId) throw new HttpError(400, "You can't deactivate your own account.");
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (!active && u.role === 'HANDLER') {
      const n = await casesThatNeed(id);
      if (n) throw new HttpError(409, `${u.displayName} can't be deactivated yet: ${n} open ${n === 1 ? 'case needs' : 'cases need'} them as one of its two readers. Ask them to recuse first, so each case passes to another member.`);
    }
    if (!active && u.role === 'ADMIN' && (await prisma.user.count({ where: { role: 'ADMIN', active: true } })) <= 1) {
      throw new HttpError(409, 'There must always be at least one active admin.');
    }
    await prisma.user.update({ where: { id }, data: { active } });
    if (!active) await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', targetType: 'USER', targetId: id });
    res.json({ active });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/users/:id/reset-mfa', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await prisma.$transaction([prisma.mfaFactor.deleteMany({ where: { userId: id } }), prisma.session.deleteMany({ where: { userId: id } })]);
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: 'MFA_RESET', targetType: 'USER', targetId: id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Only for accounts without an encryption key: resetting a member's password would lock them out of
// every report sealed to them, and letting an admin unlock keys would let an admin read reports.
adminRouter.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (u.publicKey) throw new HttpError(409, `${u.displayName}'s password protects their encryption key, so it can't be reset by an admin. They can change it themselves under My account.`);
    const temporaryPassword = oneTimePassword();
    await prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(temporaryPassword, ARGON), mustChangePassword: true } });
    await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: 'PASSWORD_RESET', targetType: 'USER', targetId: id });
    res.json({ temporaryPassword });
  } catch (e) {
    next(e);
  }
});

// ---------- Categories (never deleted: past reports use them) ----------
adminRouter.get('/categories', async (_req, res, next) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { cases: true } } } });
    res.json(cats.map((c) => ({ id: c.id, name: c.name, active: c.active })));
  } catch (e) {
    next(e);
  }
});

const catName = z.string().trim().min(2, 'Please enter a name.').max(60);
adminRouter.post('/categories', async (req, res, next) => {
  try {
    const { name } = z.object({ name: catName }).parse(req.body);
    if (await prisma.category.findUnique({ where: { name } })) throw new HttpError(409, 'That category already exists.');
    const c = await prisma.category.create({ data: { name } });
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: 'CATEGORY_ADDED', details: { name } });
    res.status(201).json(c);
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/categories/:id', async (req, res, next) => {
  try {
    const b = z.object({ name: catName.optional(), active: z.boolean().optional() }).parse(req.body);
    const c = await prisma.category.update({ where: { id: Number(req.params.id) }, data: b });
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: 'CATEGORY_CHANGED', details: { id: c.id, ...b } });
    res.json(c);
  } catch (e) {
    next(e);
  }
});

// ---------- Audit log ----------
adminRouter.get('/audit', async (req, res, next) => {
  try {
    const q = z.object({ before: z.coerce.bigint().optional(), action: z.string().max(40).optional(), actor: z.enum(['REPORTER', 'HANDLER', 'ADMIN', 'SYSTEM']).optional() }).parse(req.query);
    const rows = await prisma.auditLog.findMany({
      where: { ...(q.before ? { id: { lt: q.before } } : {}), ...(q.action ? { action: q.action } : {}), ...(q.actor ? { actorType: q.actor } : {}) },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter(Boolean) as string[] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const actions = (await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } })).map((a) => a.action);
    res.json({
      actions,
      rows: rows.map((r) => ({
        id: r.id.toString(), at: r.at, actorType: r.actorType, actor: r.actorId ? names.get(r.actorId) ?? 'Staff member' : r.actorType === 'REPORTER' ? 'Reporter' : 'System',
        action: r.action, targetType: r.targetType, targetId: r.targetType === 'CASE' ? r.targetId : null, hash: r.hash.slice(0, 12), prevHash: r.prevHash.slice(0, 12),
      })),
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/audit/verify', async (req, res, next) => {
  try {
    const result = await verifyAuditChain();
    await audit({ actorType: 'ADMIN', actorId: req.staff!.userId, action: 'AUDIT_VERIFIED', details: { ok: result.ok, checked: result.checked } });
    res.json({ ...result, at: new Date() });
  } catch (e) {
    next(e);
  }
});

// ---------- Statistics (counts only; small numbers hidden) ----------
const hide = (n: number) => (n > 0 && n < SMALL ? null : n);

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [cats, byStatus, byMode, cases, firstViews] = await Promise.all([
      prisma.category.findMany({ include: { _count: { select: { cases: true } } }, orderBy: { id: 'asc' } }),
      prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.case.groupBy({ by: ['mode'], _count: { _all: true } }),
      prisma.case.findMany({ select: { id: true, submittedAt: true } }),
      prisma.auditLog.groupBy({ by: ['targetId'], where: { action: 'CASE_VIEWED' }, _min: { at: true } }),
    ]);
    const months: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
    }
    for (const c of cases) {
      const k = `${c.submittedAt.getFullYear()}-${String(c.submittedAt.getMonth() + 1).padStart(2, '0')}`;
      if (k in months) months[k]++;
    }
    const first = new Map(firstViews.map((f) => [f.targetId, f._min.at]));
    const waits = cases.map((c) => (first.get(c.id) ? (first.get(c.id)!.getTime() - c.submittedAt.getTime()) / 86_400_000 : null)).filter((x): x is number => x !== null);
    res.json({
      threshold: SMALL,
      total: hide(cases.length),
      byCategory: cats.map((c) => ({ name: c.name, count: hide(c._count.cases) })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: hide(s._count._all) })),
      byMode: byMode.map((m) => ({ mode: m.mode, count: hide(m._count._all) })),
      byMonth: Object.entries(months).map(([month, n]) => ({ month, count: hide(n) })),
      avgFirstResponseDays: waits.length >= SMALL ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null,
      openUnread: hide(cases.length - waits.length),
    });
  } catch (e) {
    next(e);
  }
});
