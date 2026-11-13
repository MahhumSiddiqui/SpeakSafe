import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PW = process.env.STAFF_PASSWORD ?? 'Local-Test-Pass-1';
type Sess = { cookie: string; csrf: string };
const cookieOf = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[]).map((x) => x.split(';')[0]).join('; ');
const as = (s: Sess) => ({
  get: (u: string) => request(app).get(u).set('Cookie', s.cookie),
  post: (u: string) => request(app).post(u).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf),
  patch: (u: string) => request(app).patch(u).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf),
});

async function signIn(email: string, password: string): Promise<Sess> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.mfaFactor.deleteMany({ where: { userId: u.id } });
  const l = await request(app).post('/api/staff/login').send({ email, password });
  const s = await request(app).post('/api/staff/mfa/setup').send({ token: l.body.token });
  const c = await request(app).post('/api/staff/mfa/confirm').send({ token: l.body.token, code: authenticator.generate(s.body.secret) });
  return { cookie: cookieOf(c), csrf: c.body.me.csrfToken };
}

let admin: Sess;
let handler: Sess;
beforeAll(async () => {
  admin = await signIn('admin@speaksafe.test', PW);
  handler = await signIn('handler1@speaksafe.test', PW);
});

describe('admin console', () => {
  it('is for admins only', async () => {
    expect((await as(handler).get('/api/admin/users')).status).toBe(403);
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('never exposes report content, keys or messages', async () => {
    const users = await as(admin).get('/api/admin/users');
    const body = JSON.stringify(users.body);
    expect(body).not.toMatch(/encryptedPrivateKey|passwordHash|secretEnc/);
    const audit = JSON.stringify((await as(admin).get('/api/admin/audit')).body);
    expect(audit).not.toMatch(/ciphertext|sealedKey/);
    expect((await as(admin).get('/api/staff/cases')).status).toBe(403);
  });

  it('creates an account with a one-time password that must be changed first', async () => {
    const email = `new-${randomBytes(3).toString('hex')}@speaksafe.test`;
    const r = await as(admin).post('/api/admin/users').send({ email, displayName: 'New Member', role: 'HANDLER' });
    expect(r.status).toBe(201);
    expect(r.body.temporaryPassword).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    const s = await signIn(email, r.body.temporaryPassword);
    expect((await as(s).get('/api/staff/cases')).status).toBe(403);
    const ch = await as(s).post('/api/staff/password').send({ currentPassword: r.body.temporaryPassword, newPassword: 'a brand new long password' });
    expect(ch.status).toBe(200);
    expect((await as(s).get('/api/staff/cases')).status).toBe(200);
    expect((await as(admin).post('/api/admin/users').send({ email, displayName: 'Again', role: 'HANDLER' })).status).toBe(409);
  });

  it('refuses to reset the password of a member who has an encryption key', async () => {
    const h = await prisma.user.findFirstOrThrow({ where: { role: 'HANDLER', publicKey: { not: null } } });
    expect((await as(admin).post(`/api/admin/users/${h.id}/reset-password`)).status).toBe(409);
  });

  it('keeps at least one admin and cannot deactivate itself', async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@speaksafe.test' } });
    expect((await as(admin).post(`/api/admin/users/${me.id}/active`).send({ active: false })).status).toBe(400);
  });

  it('adds and hides categories but never deletes them', async () => {
    const name = `Test ${randomBytes(2).toString('hex')}`;
    const c = await as(admin).post('/api/admin/categories').send({ name });
    expect(c.status).toBe(201);
    const off = await as(admin).patch(`/api/admin/categories/${c.body.id}`).send({ active: false });
    expect(off.body.active).toBe(false);
    expect((await request(app).get('/api/categories')).body.map((x: { name: string }) => x.name)).not.toContain(name);
  });

  it('verifies the audit chain, and detects tampering', async () => {
    const ok = await as(admin).post('/api/admin/audit/verify');
    expect(ok.body.ok).toBe(true);
    // Simulate an attacker editing a log row directly (bypassing the app; triggers must be lifted to do so).
    const row = await prisma.auditLog.findFirstOrThrow({ orderBy: { id: 'asc' } });
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" DISABLE TRIGGER USER');
    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'EDITED' WHERE id = ${row.id}`);
    const bad = await as(admin).post('/api/admin/audit/verify');
    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = '${row.action}' WHERE id = ${row.id}`);
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" ENABLE TRIGGER USER');
    expect(bad.body.ok).toBe(false);
    expect(bad.body.brokenAtId).toBe(row.id.toString());
    expect((await as(admin).post('/api/admin/audit/verify')).body.ok).toBe(true);
  });

  it('hides any statistic below 5', async () => {
    const s = await as(admin).get('/api/admin/stats');
    expect(s.status).toBe(200);
    for (const row of [...s.body.byCategory, ...s.body.byStatus, ...s.body.byMode, ...s.body.byMonth]) {
      if (row.count !== null) expect(row.count === 0 || row.count >= 5).toBe(true);
    }
  });
});
