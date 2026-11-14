import { Router, raw } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireReporter } from '../lib/reporterSession.js';
import { HttpError } from '../middleware/error.js';

// The reporter's private journal and evidence locker. Everything is encrypted in the browser with
// the account's master key, so the server stores ciphertext it cannot open. These are private notes,
// not reports: the owner may edit and delete them, and nothing about them is written to the audit log.
export const journalRouter = Router();
journalRouter.use(requireReporter);

const b64 = (max: number) => z.string().min(16).max(max).regex(/^[A-Za-z0-9+/=]+$/, 'Invalid encoding');
const MAX_ENTRIES = 500;
const MAX_FILES = 60;
const MAX_FILE = 15 * 1024 * 1024;
const entryBody = z.object({ ciphertext: b64(80_000) });
const idParam = (v: unknown) => z.string().uuid().parse(v);

// ---- Entries ----
journalRouter.get('/entries', async (req, res, next) => {
  try {
    const rows = await prisma.journalEntry.findMany({
      where: { accountId: req.reporter!.accountId },
      select: { id: true, ciphertext: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

journalRouter.post('/entries', async (req, res, next) => {
  try {
    const { ciphertext } = entryBody.parse(req.body);
    const accountId = req.reporter!.accountId;
    if ((await prisma.journalEntry.count({ where: { accountId } })) >= MAX_ENTRIES) throw new HttpError(400, `A journal can hold up to ${MAX_ENTRIES} entries.`);
    const e = await prisma.journalEntry.create({ data: { accountId, ciphertext }, select: { id: true, createdAt: true, updatedAt: true } });
    res.status(201).json(e);
  } catch (e) {
    next(e);
  }
});

journalRouter.put('/entries/:id', async (req, res, next) => {
  try {
    const { ciphertext } = entryBody.parse(req.body);
    const r = await prisma.journalEntry.updateMany({ where: { id: idParam(req.params.id), accountId: req.reporter!.accountId }, data: { ciphertext } });
    if (!r.count) throw new HttpError(404, 'Entry not found.');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

journalRouter.delete('/entries/:id', async (req, res, next) => {
  try {
    const r = await prisma.journalEntry.deleteMany({ where: { id: idParam(req.params.id), accountId: req.reporter!.accountId } });
    if (!r.count) throw new HttpError(404, 'Entry not found.');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Evidence locker ----
journalRouter.get('/files', async (req, res, next) => {
  try {
    const rows = await prisma.lockerFile.findMany({
      where: { accountId: req.reporter!.accountId },
      select: { id: true, meta: true, size: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// The encrypted description (kind, type, label) travels in a header next to the encrypted bytes.
journalRouter.post('/files', raw({ type: 'application/octet-stream', limit: MAX_FILE }), async (req, res, next) => {
  try {
    const accountId = req.reporter!.accountId;
    const meta = b64(4_000).parse(req.get('X-Locker-Meta') ?? '');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 41) throw new HttpError(400, 'The file is empty.');
    if ((await prisma.lockerFile.count({ where: { accountId } })) >= MAX_FILES) throw new HttpError(400, `The locker can hold up to ${MAX_FILES} files.`);
    const f = await prisma.lockerFile.create({ data: { accountId, meta, ciphertext: new Uint8Array(body), size: body.length }, select: { id: true, createdAt: true } });
    res.status(201).json(f);
  } catch (e) {
    next(e);
  }
});

journalRouter.get('/files/:id', async (req, res, next) => {
  try {
    const f = await prisma.lockerFile.findFirst({ where: { id: idParam(req.params.id), accountId: req.reporter!.accountId }, select: { ciphertext: true } });
    if (!f) throw new HttpError(404, 'File not found.');
    res.type('application/octet-stream').send(Buffer.from(f.ciphertext));
  } catch (e) {
    next(e);
  }
});

journalRouter.delete('/files/:id', async (req, res, next) => {
  try {
    const r = await prisma.lockerFile.deleteMany({ where: { id: idParam(req.params.id), accountId: req.reporter!.accountId } });
    if (!r.count) throw new HttpError(404, 'File not found.');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
