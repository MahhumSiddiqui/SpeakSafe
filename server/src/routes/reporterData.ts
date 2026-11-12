import { Router, raw } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireReporter } from '../lib/reporterSession.js';
import { requireCaseAuth } from '../lib/caseAuth.js';
import { HttpError } from '../middleware/error.js';

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
reporterDataRouter.get('/cases/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const access = await requireCaseAuth(req, id);
    const c = await prisma.case.findUniqueOrThrow({
      where: { id },
      include: { category: { select: { name: true } }, attachments: { select: { id: true, kind: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
    });
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
    });
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
