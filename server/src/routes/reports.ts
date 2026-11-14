import { Router, raw } from 'express';
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireReporter } from '../lib/reporterSession.js';
import { signToken, verifyToken } from '../lib/tokens.js';
import { caseVerifier, requireCaseAuth } from '../lib/caseAuth.js';
import { HttpError } from '../middleware/error.js';
import { auditReleases, tagAndMatch } from '../lib/match.js';

// Submitting reports. Content arrives already encrypted in the browser; the server only checks shapes,
// picks the readers, stores ciphertext and records the event in the audit log.
export const reportsRouter = Router();
reportsRouter.use(requireReporter);

const b64 = (max: number) => z.string().min(16).max(max).regex(/^[A-Za-z0-9+/=]+$/, 'Invalid encoding');
const READERS = 2;
const PREPARE = 'report-prepare';
const MAX_FILE = 15 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const KINDS = { image: ['image/jpeg'], pdf: ['application/pdf'], voice: ['audio/webm', 'audio/ogg', 'audio/mp4'] } as const;

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const caseCode = () => `SS-${Array.from({ length: 8 }, (_, i) => (i === 4 ? '-' : '') + ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

/** Step 1: choose two readers with the lightest open workload, never anyone the reporter excluded. */
reportsRouter.post('/prepare', async (req, res, next) => {
  try {
    const { excluded } = z.object({ excluded: z.array(z.string().uuid()).max(50).default([]) }).parse(req.body);
    const handlers = await prisma.user.findMany({
      where: { role: 'HANDLER', active: true, publicKey: { not: null }, id: { notIn: excluded } },
      select: { id: true, displayName: true, publicKey: true, reportKeys: { where: { case: { status: { not: 'CLOSED' } } }, select: { id: true } } },
    });
    if (handlers.length < READERS) {
      throw new HttpError(409, 'At least two committee members must be able to read your report. Please keep fewer people away, or contact the institution another way.');
    }
    const chosen = handlers
      .map((h) => ({ ...h, load: h.reportKeys.length, tie: Math.random() }))
      .sort((a, b) => a.load - b.load || a.tie - b.tie)
      .slice(0, READERS)
      .map(({ id, displayName, publicKey }) => ({ id, displayName, publicKey: publicKey! }));
    const subject = Buffer.from(JSON.stringify({ r: chosen.map((h) => h.id), x: excluded })).toString('base64url');
    res.json({ readers: chosen, token: signToken(PREPARE, subject, 30 * 60 * 1000) });
  } catch (e) {
    next(e);
  }
});

const submitBody = z.object({
  token: z.string().max(4096),
  categoryId: z.number().int().positive(),
  mode: z.enum(['ANONYMOUS', 'CONFIDENTIAL', 'NAMED']),
  aboutOther: z.boolean(),
  nonce: b64(64),
  ciphertext: b64(700_000),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sealedKeys: z.record(z.string().uuid(), b64(256)),
  reporterPublicKey: b64(64),
  reporterSealedKey: b64(256),
  caseAuthKey: b64(128),
  // "Not alone": an OPRF token for the person named (never the ID itself), and whether to hold the report.
  matchToken: z.string().length(44).regex(/^[A-Za-z0-9+/]+=$/).optional(),
  hold: z.boolean().default(false),
});

/** Step 2: store the encrypted report, its readers' sealed keys and the reporter's exclusions. */
reportsRouter.post('/', async (req, res, next) => {
  try {
    const b = submitBody.parse(req.body);
    const subject = verifyToken(PREPARE, b.token);
    if (!subject) throw new HttpError(409, 'This report took a while to send. Please press Send again.');
    const { r: readers, x: excluded } = JSON.parse(Buffer.from(subject, 'base64url').toString()) as { r: string[]; x: string[] };
    const keyed = Object.keys(b.sealedKeys).sort();
    if (keyed.join() !== [...readers].sort().join()) throw new HttpError(400, 'The report was not locked for the right committee members.');
    const category = await prisma.category.findFirst({ where: { id: b.categoryId, active: true } });
    if (!category) throw new HttpError(400, 'Please choose a type of concern.');

    // The fingerprint must match what we actually store (SHA-256 of nonce + ciphertext).
    const stored = Buffer.concat([Buffer.from(b.nonce, 'base64'), Buffer.from(b.ciphertext, 'base64')]);
    const fingerprint = createHash('sha256').update(stored).digest('hex');
    if (fingerprint !== b.fingerprint) throw new HttpError(400, 'The report changed on the way. Please try sending again.');
    if (b.hold && !b.matchToken) throw new HttpError(400, 'To hold a report, please enter the ID of the person it is about.');

    let id = caseCode();
    while (await prisma.case.findUnique({ where: { id }, select: { id: true } })) id = caseCode();

    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.case.create({
        data: {
          id,
          categoryId: category.id,
          mode: b.mode,
          aboutOther: b.aboutOther,
          ciphertext: b.ciphertext,
          nonce: b.nonce,
          fingerprint,
          assignedHandlerId: readers[0],
          held: b.hold,
          releasedAt: b.hold ? null : new Date(),
        },
      });
      await tx.caseAccess.create({
        data: { caseId: id, salt: '', authVerifier: caseVerifier(b.caseAuthKey), reporterPublicKey: b.reporterPublicKey, reporterSealedKey: b.reporterSealedKey },
      });
      await tx.reportKey.createMany({ data: readers.map((handlerId) => ({ caseId: id, handlerId, sealedKey: b.sealedKeys[handlerId] })) });
      if (excluded.length) await tx.exclusion.createMany({ data: excluded.map((handlerId) => ({ caseId: id, handlerId })) });
      const m = b.matchToken ? await tagAndMatch(tx, id, b.matchToken) : { released: [] as string[], linked: 0 };
      return { c, ...m };
    });
    await audit({ actorType: 'REPORTER', action: b.hold ? 'CASE_HELD' : 'CASE_SUBMITTED', targetType: 'CASE', targetId: id, details: { mode: b.mode, readers: readers.length, excluded: excluded.length } });
    await auditReleases(created.released, 'match');
    const stillHeld = b.hold && !created.released.includes(id);
    res.status(201).json({ caseId: id, fingerprint, submittedAt: created.c.submittedAt, held: stillHeld, notAlone: created.linked > 0 });
  } catch (e) {
    next(e);
  }
});

/** Evidence or a voice note, encrypted in the browser with the report's content key. Append-only. */
reportsRouter.post('/:id/attachments', raw({ type: 'application/octet-stream', limit: MAX_FILE }), async (req, res, next) => {
  try {
    const caseId = String(req.params.id);
    await requireCaseAuth(req, caseId);
    const kind = String(req.get('X-Attachment-Kind') ?? '') as keyof typeof KINDS;
    const mimeType = String(req.get('X-Attachment-Type') ?? '');
    const purpose = String(req.get('X-Attachment-Purpose') ?? 'evidence');
    if (purpose !== 'evidence' && !(purpose === 'message' && kind === 'voice')) throw new HttpError(400, 'Only voice notes can be sent as messages.');
    if (!(kind in KINDS) || !(KINDS[kind] as readonly string[]).includes(mimeType)) throw new HttpError(400, 'This type of file is not accepted.');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 41) throw new HttpError(400, 'The file is empty.');
    if ((await prisma.attachment.count({ where: { caseId } })) >= MAX_ATTACHMENTS) throw new HttpError(400, `A case can have at most ${MAX_ATTACHMENTS} files.`);
    const nonce = body.subarray(0, 24);
    const a = await prisma.attachment.create({
      data: {
        caseId,
        kind,
        purpose,
        mimeType,
        size: body.length,
        nonce: nonce.toString('base64'),
        ciphertext: new Uint8Array(body.subarray(24)),
        fingerprint: createHash('sha256').update(body).digest('hex'),
      },
      select: { id: true, fingerprint: true },
    });
    if (purpose === 'evidence') await audit({ actorType: 'REPORTER', action: 'ATTACHMENT_ADDED', targetType: 'CASE', targetId: caseId, details: { kind } });
    res.status(201).json(a);
  } catch (e) {
    next(e);
  }
});
