import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { hmac, signToken, verifyToken } from '../lib/tokens.js';
import { endReporterSession, requireReporter, startReporterSession } from '../lib/reporterSession.js';
import { authLimiter, signupLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/error.js';

// Reporter "private space" accounts. The browser derives keys from the password with Argon2id;
// the server only ever sees an auth key (which it hashes again) and ciphertext it cannot open.
export const reporterRouter = Router();

const b64 = (max = 512) => z.string().min(16).max(max).regex(/^[A-Za-z0-9+/=_-]+$/, 'Invalid encoding');
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use only letters, numbers and single hyphens');

const ARGON = { type: argon2.argon2id } as const;
const DUMMY_HASH = argon2.hash('speaksafe-dummy-auth-key', ARGON); // equal work for unknown usernames
const fakeSalt = (purpose: string, name: string) => hmac(purpose, name).subarray(0, 16).toString('base64');
const RESET_PURPOSE = 'reporter-reset';

function keyBundle(a: { username: string; masterKeyEnc: string; secretKeyEnc: string; publicKey: string }) {
  return { username: a.username, masterKeyEnc: a.masterKeyEnc, secretKeyEnc: a.secretKeyEnc, publicKey: a.publicKey };
}

// ---- Sign up ----
const signupBody = z.object({
  username,
  pwSalt: b64(64),
  authKey: b64(128),
  masterKeyEnc: b64(),
  recSalt: b64(64),
  recAuthKey: b64(128),
  masterKeyRecEnc: b64(),
  publicKey: b64(128),
  secretKeyEnc: b64(),
});

reporterRouter.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const b = signupBody.parse(req.body);
    const exists = await prisma.reporterAccount.findUnique({ where: { username: b.username }, select: { id: true } });
    if (exists) throw new HttpError(409, 'That username is already taken. Please choose another one.');
    const account = await prisma.reporterAccount.create({
      data: {
        username: b.username,
        pwSalt: b.pwSalt,
        authHash: await argon2.hash(b.authKey, ARGON),
        masterKeyEnc: b.masterKeyEnc,
        recSalt: b.recSalt,
        recAuthHash: await argon2.hash(b.recAuthKey, ARGON),
        masterKeyRecEnc: b.masterKeyRecEnc,
        publicKey: b.publicKey,
        secretKeyEnc: b.secretKeyEnc,
      },
    });
    // No account ID or username in the audit log: it must never link a person to a report.
    await audit({ actorType: 'REPORTER', action: 'REPORTER_ACCOUNT_CREATED' });
    const csrfToken = await startReporterSession(res, account.id);
    res.status(201).json({ ...keyBundle(account), csrfToken });
  } catch (e) {
    next(e);
  }
});

// ---- Log in (two steps: fetch salt, then prove the password-derived key) ----
reporterRouter.post('/prelogin', authLimiter, async (req, res, next) => {
  try {
    const { username: name } = z.object({ username }).parse(req.body);
    const a = await prisma.reporterAccount.findUnique({ where: { username: name }, select: { pwSalt: true } });
    // Unknown usernames get a stable fake salt, so this step does not reveal who has an account.
    res.json({ pwSalt: a?.pwSalt ?? fakeSalt('pwsalt', name) });
  } catch (e) {
    next(e);
  }
});

reporterRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const b = z.object({ username, authKey: b64(128) }).parse(req.body);
    const a = await prisma.reporterAccount.findUnique({ where: { username: b.username } });
    const ok = a ? await argon2.verify(a.authHash, b.authKey) : (await argon2.verify(await DUMMY_HASH, b.authKey), false);
    if (!a || !ok) throw new HttpError(401, "That username and password don't match. Please check and try again.");
    const csrfToken = await startReporterSession(res, a.id);
    res.json({ ...keyBundle(a), csrfToken });
  } catch (e) {
    next(e);
  }
});

reporterRouter.post('/logout', async (req, res, next) => {
  try {
    await endReporterSession(req, res);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

reporterRouter.get('/me', requireReporter, async (req, res, next) => {
  try {
    const a = await prisma.reporterAccount.findUniqueOrThrow({ where: { id: req.reporter!.accountId } });
    const s = await prisma.reporterSession.findUniqueOrThrow({ where: { id: req.reporter!.sessionId } });
    res.json({ ...keyBundle(a), createdAt: a.createdAt, csrfToken: s.csrfToken });
  } catch (e) {
    next(e);
  }
});

// Keeps the session alive while the person is active in the browser.
reporterRouter.post('/ping', requireReporter, (_req, res) => {
  res.json({ ok: true });
});

// ---- Forgotten password: recovery words ----
reporterRouter.post('/recover/start', authLimiter, async (req, res, next) => {
  try {
    const { username: name } = z.object({ username }).parse(req.body);
    const a = await prisma.reporterAccount.findUnique({ where: { username: name }, select: { recSalt: true } });
    res.json({ recSalt: a?.recSalt ?? fakeSalt('recsalt', name) });
  } catch (e) {
    next(e);
  }
});

reporterRouter.post('/recover/verify', authLimiter, async (req, res, next) => {
  try {
    const b = z.object({ username, recAuthKey: b64(128) }).parse(req.body);
    const a = await prisma.reporterAccount.findUnique({ where: { username: b.username } });
    const ok = a ? await argon2.verify(a.recAuthHash, b.recAuthKey) : (await argon2.verify(await DUMMY_HASH, b.recAuthKey), false);
    if (!a || !ok) throw new HttpError(401, "Those recovery words don't match this username. Please check the spelling and order.");
    res.json({ masterKeyRecEnc: a.masterKeyRecEnc, resetToken: signToken(RESET_PURPOSE, a.id, 10 * 60 * 1000) });
  } catch (e) {
    next(e);
  }
});

reporterRouter.post('/recover/reset', authLimiter, async (req, res, next) => {
  try {
    const b = z.object({ resetToken: z.string().max(512), pwSalt: b64(64), authKey: b64(128), masterKeyEnc: b64() }).parse(req.body);
    const accountId = verifyToken(RESET_PURPOSE, b.resetToken);
    if (!accountId) throw new HttpError(401, 'This recovery took too long. Please start again.');
    const a = await prisma.reporterAccount.update({
      where: { id: accountId },
      data: { pwSalt: b.pwSalt, authHash: await argon2.hash(b.authKey, ARGON), masterKeyEnc: b.masterKeyEnc, passwordChangedAt: new Date() },
    });
    // Anyone who was logged in with the old password is logged out everywhere.
    await prisma.reporterSession.deleteMany({ where: { accountId } });
    await audit({ actorType: 'REPORTER', action: 'REPORTER_PASSWORD_RESET' });
    const csrfToken = await startReporterSession(res, a.id);
    res.json({ ...keyBundle(a), csrfToken });
  } catch (e) {
    next(e);
  }
});
