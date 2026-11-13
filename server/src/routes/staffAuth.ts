import { Router } from 'express';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { signToken, verifyToken } from '../lib/tokens.js';
import { decryptAtRest, encryptAtRest } from '../lib/secretBox.js';
import { endStaffSession, requireStaff, startStaffSession } from '../lib/staffSession.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/error.js';

// Committee and admin sign-in: password, then a TOTP code from an authenticator app (RFC 6238). MFA is mandatory.
export const staffAuthRouter = Router();

authenticator.options = { window: 1, step: 30, digits: 6 };
const ARGON = { type: argon2.argon2id } as const;
const DUMMY = argon2.hash('speaksafe-dummy-password', ARGON);
const SETUP = 'staff-mfa-setup';
const MFA = 'staff-mfa';
const ISSUER = 'SpeakSafe';

const b64 = (max: number) => z.string().min(16).max(max).regex(/^[A-Za-z0-9+/=]+$/, 'Invalid encoding');
const code6 = z.string().trim().regex(/^\d{6}$/, 'Enter the 6 numbers from your app.');

async function mePayload(u: User, csrfToken: string) {
  const mfa = await prisma.mfaFactor.findUnique({ where: { userId: u.id } });
  return {
    id: u.id, email: u.email, displayName: u.displayName, role: u.role,
    publicKey: u.publicKey, encryptedPrivateKey: u.encryptedPrivateKey, keySalt: u.keySalt,
    needsKeys: u.role === 'HANDLER' && !u.publicKey,
    recoveryCodesLeft: mfa?.recoveryCodes.length ?? 0,
    mustChangePassword: u.mustChangePassword,
    csrfToken,
  };
}

/** Accepts a code once: the time step must be newer than the last code used (stops replay). */
function acceptTotp(secret: string, code: string, lastUsedStep: number | null): number | null {
  const delta = authenticator.checkDelta(code, secret);
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 30_000) + delta;
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

// Step 1: email + password.
staffAuthRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const b = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(500) }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: b.email }, include: { mfa: true } });
    const ok = u && u.active ? await argon2.verify(u.passwordHash, b.password) : (await argon2.verify(await DUMMY, b.password), false);
    if (!u || !u.active || !ok) {
      await audit({ actorType: 'SYSTEM', action: 'STAFF_LOGIN_FAILED', targetType: 'USER', targetId: u?.id ?? null });
      throw new HttpError(401, "That email and password don't match. Please check and try again.");
    }
    if (u.mfa?.confirmed) return res.json({ next: 'mfa', token: signToken(MFA, u.id, 5 * 60 * 1000) });
    res.json({ next: 'setup', token: signToken(SETUP, u.id, 15 * 60 * 1000), displayName: u.displayName });
  } catch (e) {
    next(e);
  }
});

// First sign-in: create the authenticator secret and show it as a QR code.
staffAuthRouter.post('/mfa/setup', authLimiter, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().max(512) }).parse(req.body);
    const userId = verifyToken(SETUP, token);
    if (!userId) throw new HttpError(401, 'This setup took too long. Please sign in again.');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { mfa: true } });
    if (u.mfa?.confirmed) throw new HttpError(409, 'Two-step sign-in is already set up for this account.');
    const secret = authenticator.generateSecret(20); // 160-bit secret, base32
    await prisma.mfaFactor.upsert({
      where: { userId },
      update: { secretEnc: encryptAtRest(secret), confirmed: false, recoveryCodes: [], lastUsedStep: null },
      create: { userId, secretEnc: encryptAtRest(secret) },
    });
    res.json({ otpauth: authenticator.keyuri(u.email, ISSUER, secret), secret });
  } catch (e) {
    next(e);
  }
});

function newRecoveryCodes(n = 10) {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => Array.from({ length: 10 }, (_, i) => (i === 5 ? '-' : '') + A[randomInt(A.length)]).join(''));
}

staffAuthRouter.post('/mfa/confirm', authLimiter, async (req, res, next) => {
  try {
    const b = z.object({ token: z.string().max(512), code: code6 }).parse(req.body);
    const userId = verifyToken(SETUP, b.token);
    if (!userId) throw new HttpError(401, 'This setup took too long. Please sign in again.');
    const mfa = await prisma.mfaFactor.findUnique({ where: { userId } });
    if (!mfa || mfa.confirmed) throw new HttpError(409, 'Please start the setup again.');
    const step = acceptTotp(decryptAtRest(mfa.secretEnc), b.code, null);
    if (step === null) throw new HttpError(401, "That code didn't work. Check your phone's time is set automatically, then try the newest code.");
    const codes = newRecoveryCodes();
    await prisma.mfaFactor.update({
      where: { userId },
      data: { confirmed: true, lastUsedStep: step, recoveryCodes: await Promise.all(codes.map((c) => argon2.hash(c, ARGON))) },
    });
    const u = await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await audit({ actorType: u.role === 'ADMIN' ? 'ADMIN' : 'HANDLER', actorId: u.id, action: 'MFA_ENABLED' });
    const csrf = await startStaffSession(res, u.id);
    res.json({ recoveryCodes: codes, me: await mePayload(u, csrf) });
  } catch (e) {
    next(e);
  }
});

// Step 2 on every later sign-in: the 6-digit code, or one single-use recovery code.
staffAuthRouter.post('/mfa/verify', authLimiter, async (req, res, next) => {
  try {
    const b = z.object({ token: z.string().max(512), code: code6.optional(), recoveryCode: z.string().trim().toLowerCase().max(20).optional() }).parse(req.body);
    const userId = verifyToken(MFA, b.token);
    if (!userId) throw new HttpError(401, 'This took too long. Please sign in again.');
    const mfa = await prisma.mfaFactor.findUniqueOrThrow({ where: { userId } });
    let usedRecovery = false;
    if (b.code) {
      const step = acceptTotp(decryptAtRest(mfa.secretEnc), b.code, mfa.lastUsedStep);
      if (step === null) {
        await audit({ actorType: 'SYSTEM', action: 'STAFF_MFA_FAILED', targetType: 'USER', targetId: userId });
        throw new HttpError(401, "That code didn't work. Please wait for a new code and try again.");
      }
      await prisma.mfaFactor.update({ where: { userId }, data: { lastUsedStep: step } });
    } else if (b.recoveryCode) {
      let idx = -1;
      for (let i = 0; i < mfa.recoveryCodes.length; i++) {
        if (await argon2.verify(mfa.recoveryCodes[i], b.recoveryCode)) { idx = i; break; }
      }
      if (idx < 0) throw new HttpError(401, "That recovery code didn't work. Each code can be used only once.");
      await prisma.mfaFactor.update({ where: { userId }, data: { recoveryCodes: mfa.recoveryCodes.filter((_, i) => i !== idx) } });
      usedRecovery = true;
    } else {
      throw new HttpError(400, 'Enter the 6 numbers from your app.');
    }
    const u = await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await audit({ actorType: u.role === 'ADMIN' ? 'ADMIN' : 'HANDLER', actorId: u.id, action: 'STAFF_LOGIN', details: { recoveryCode: usedRecovery } });
    const csrf = await startStaffSession(res, u.id);
    res.json({ me: await mePayload(u, csrf) });
  } catch (e) {
    next(e);
  }
});

staffAuthRouter.get('/me', requireStaff(), async (req, res, next) => {
  try {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.staff!.userId } });
    const s = await prisma.session.findUniqueOrThrow({ where: { id: req.staff!.sessionId } });
    res.json(await mePayload(u, s.csrfToken));
  } catch (e) {
    next(e);
  }
});

// A committee member's key pair is created in their own browser; the private key arrives already encrypted.
staffAuthRouter.post('/keys', requireStaff('HANDLER'), async (req, res, next) => {
  try {
    const b = z.object({ publicKey: b64(64), encryptedPrivateKey: b64(256), keySalt: b64(64) }).parse(req.body);
    const r = await prisma.user.updateMany({ where: { id: req.staff!.userId, publicKey: null }, data: b });
    if (!r.count) throw new HttpError(409, 'Your encryption keys already exist.');
    await audit({ actorType: 'HANDLER', actorId: req.staff!.userId, action: 'KEYS_CREATED' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

staffAuthRouter.post('/ping', requireStaff(), (_req, res) => res.json({ ok: true }));

// Change your own password. A member's private key is re-locked with the new password in their browser,
// so the server receives only the newly encrypted key, never the key itself.
const STRONG = z.string().min(12, 'Use at least 12 characters.').max(500);
staffAuthRouter.post('/password', requireStaff(), async (req, res, next) => {
  try {
    const b = z.object({ currentPassword: z.string().min(1).max(500), newPassword: STRONG, encryptedPrivateKey: b64(256).optional(), keySalt: b64(64).optional() }).parse(req.body);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.staff!.userId } });
    if (!(await argon2.verify(u.passwordHash, b.currentPassword))) throw new HttpError(401, 'Your current password is not correct.');
    if (b.newPassword === b.currentPassword) throw new HttpError(400, 'Please choose a password different from the current one.');
    if (u.publicKey && (!b.encryptedPrivateKey || !b.keySalt)) throw new HttpError(400, 'Your encryption key must be re-locked with the new password.');
    await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await argon2.hash(b.newPassword, ARGON),
        mustChangePassword: false,
        ...(u.publicKey ? { encryptedPrivateKey: b.encryptedPrivateKey, keySalt: b.keySalt } : {}),
      },
    });
    // Sign out every other session of this account.
    await prisma.session.deleteMany({ where: { userId: u.id, id: { not: req.staff!.sessionId } } });
    await audit({ actorType: u.role === 'ADMIN' ? 'ADMIN' : 'HANDLER', actorId: u.id, action: 'PASSWORD_CHANGED' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

staffAuthRouter.post('/logout', async (req, res, next) => {
  try {
    await endStaffSession(req, res);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
