import { Router, raw } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireReporter } from '../lib/reporterSession.js';
import { requireCaseAuth } from '../lib/caseAuth.js';
import { audit } from '../lib/audit.js';
import { HttpError } from '../middleware/error.js';
import { auditReleases, linkedCases } from '../lib/match.js';

// The reporter's own encrypted data: case list (vault), the unfinished draft and its files,
// and read access to their own cases. Everything here is ciphertext the server cannot open.
export const reporterDataRouter = Router();
reporterDataRouter.use(requireReporter);

const b64 = (max: number) => z.string().min(16).max(max).regex(/^[A-Za-z0-9+/=]+$/, 'Invalid encoding');
const MAX_DRAFT_FILE = 15 * 1024 * 1024;
const MAX_DRAFT_FILES = 12;

// ---- Vault: encrypted list of this person's cases ----
reporterDataRouter.get('/vault', async (req, res, next) => {
  try {
    const a = await prisma.reporterAccount.findUniqueOrThrow({ where: { id: req.reporter!.accountId }, select: { vaultEnc: true } });
    res.json({ vaultEnc: a.vaultEnc });
  } catch (e) {
    next(e);
  }
});

reporterDataRouter.put('/vault', async (req, res, next) => {
  try {
    const { vaultEnc } = z.object({ vaultEnc: b64(200_000) }).parse(req.body);
    await prisma.reporterAccount.update({ where: { id: req.reporter!.accountId }, data: { vaultEnc } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Draft (one per account) ----
reporterDataRouter.get('/draft', async (req, res, next) => {
  try {
    const d = await prisma.reporterDraft.findUnique({ where: { accountId: req.reporter!.accountId } });
    res.json(d ? { ciphertext: d.ciphertext, updatedAt: d.updatedAt } : null);
  } catch (e) {
    next(e);
  }
});

reporterDataRouter.put('/draft', async (req, res, next) => {
  try {
    const { ciphertext } = z.object({ ciphertext: b64(700_000) }).parse(req.body);
    const accountId = req.reporter!.accountId;
    const d = await prisma.reporterDraft.upsert({ where: { accountId }, update: { ciphertext }, create: { accountId, ciphertext } });
    res.json({ updatedAt: d.updatedAt });
  } catch (e) {
    next(e);
  }
});

// Discarding a draft (or finishing it) removes it and its files: a draft is not a report.
reporterDataRouter.delete('/draft', async (req, res, next) => {
  try {
    const accountId = req.reporter!.accountId;
    await prisma.$transaction([prisma.reporterDraft.deleteMany({ where: { accountId } }), prisma.draftFile.deleteMany({ where: { accountId } })]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

reporterDataRouter.post('/draft/files', raw({ type: 'application/octet-stream', limit: MAX_DRAFT_FILE }), async (req, res, next) => {
  try {
    const accountId = req.reporter!.accountId;
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 41) throw new HttpError(400, 'The file is empty.');
    if ((await prisma.draftFile.count({ where: { accountId } })) >= MAX_DRAFT_FILES) throw new HttpError(400, `You can add up to ${MAX_DRAFT_FILES} files to one report.`);
    const f = await prisma.draftFile.create({ data: { accountId, ciphertext: new Uint8Array(body), size: body.length }, select: { id: true } });
    res.status(201).json(f);
  } catch (e) {
    next(e);
  }
});

reporterDataRouter.get('/draft/files/:id', async (req, res, next) => {
  try {
    const f = await prisma.draftFile.findFirst({ where: { id: String(req.params.id), accountId: req.reporter!.accountId } });
    if (!f) throw new HttpError(404, 'File not found.');
    res.type('application/octet-stream').send(Buffer.from(f.ciphertext));
  } catch (e) {
    next(e);
  }
});

reporterDataRouter.delete('/draft/files/:id', async (req, res, next) => {
  try {
    await prisma.draftFile.deleteMany({ where: { id: String(req.params.id), accountId: req.reporter!.accountId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- The reporter's own cases (proved with the per-case key, not the account) ----
const msgBody = z.object({ nonce: b64(64), ciphertext: b64(40_000) });

// Messages are encrypted in the browser with the case key; they can never be edited or deleted.
reporterDataRouter.post('/cases/:id/messages', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await requireCaseAuth(req, id);
    const b = msgBody.parse(req.body);
    const m = await prisma.message.create({ data: { caseId: id, senderType: 'REPORTER', nonce: b.nonce, ciphertext: b.ciphertext, keys: {} } });
    await audit({ actorType: 'REPORTER', action: 'MESSAGE_SENT', targetType: 'CASE', targetId: id });
    res.status(201).json({ id: m.id, createdAt: m.createdAt });
  } catch (e) {
    next(e);
  }
});
reporterDataRouter.get('/cases/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const access = await requireCaseAuth(req, id);
    const c = await prisma.case.findUniqueOrThrow({
      where: { id },
      include: {
        category: { select: { name: true } },
        attachments: { where: { purpose: 'evidence' }, select: { id: true, kind: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        messages: { select: { id: true, senderType: true, nonce: true, ciphertext: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    // Progress the reporter may see: when the committee first opened the case, and each status change.
    const [firstView, changes] = await Promise.all([
      prisma.auditLog.findFirst({ where: { targetType: 'CASE', targetId: id, action: 'CASE_VIEWED' }, orderBy: { id: 'asc' }, select: { at: true } }),
      prisma.auditLog.findMany({ where: { targetType: 'CASE', targetId: id, action: { in: ['STATUS_CHANGED', 'CLOSURE_REQUESTED', 'CASE_CLOSED', 'CLOSURE_REJECTED'] } }, orderBy: { id: 'asc' }, select: { at: true, action: true, details: true } }),
    ]);
    res.json({
      id: c.id,
      status: c.status,
      category: c.category.name,
      mode: c.mode,
      aboutOther: c.aboutOther,
      submittedAt: c.submittedAt,
      updatedAt: c.updatedAt,
      nonce: c.nonce,
      ciphertext: c.ciphertext,
      fingerprint: c.fingerprint,
      reporterSealedKey: access.reporterSealedKey,
      attachments: c.attachments,
      firstViewedAt: firstView?.at ?? null,
      history: changes.map((h) => ({
        at: h.at,
        to: h.action === 'STATUS_CHANGED' ? (h.details as { to: string }).to : h.action === 'CASE_CLOSED' ? 'CLOSED' : h.action === 'CLOSURE_REQUESTED' ? 'PENDING_CLOSURE' : null,
      })).filter((h) => h.to),
      messages: c.messages.map((m) => ({ id: m.id, from: m.senderType === 'REPORTER' ? 'me' : 'committee', nonce: m.nonce, ciphertext: m.ciphertext, createdAt: m.createdAt })),
      held: c.held,
      releasedAt: c.releasedAt,
      // "Not alone": how many other reports name the same person. Never which ones, or who wrote them.
      notAlone: (await linkedCases(prisma, id)).length,
    });
  } catch (e) {
    next(e);
  }
});

// "Send it now": the reporter releases their held report to the committee without waiting for a match.
reporterDataRouter.post('/cases/:id/release', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await requireCaseAuth(req, id);
    const r = await prisma.case.updateMany({ where: { id, held: true }, data: { held: false, releasedAt: new Date() } });
    if (r.count) await auditReleases([id], 'reporter');
    res.json({ held: false });
  } catch (e) {
    next(e);
  }
});

reporterDataRouter.get('/cases/:id/attachments/:aid', async (req, res, next) => {
  try {
    const caseId = String(req.params.id);
    await requireCaseAuth(req, caseId);
    const a = await prisma.attachment.findFirst({ where: { id: String(req.params.aid), caseId } });
    if (!a) throw new HttpError(404, 'File not found.');
    res.type('application/octet-stream').send(Buffer.concat([Buffer.from(a.nonce, 'base64'), Buffer.from(a.ciphertext)]));
  } catch (e) {
    next(e);
  }
});
