import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PW = process.env.STAFF_PASSWORD ?? 'Local-Test-Pass-1';
const b = (n = 32) => randomBytes(n).toString('base64');
type Sess = { cookie: string; csrf: string; id: string };
const cookieOf = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[]).map((x) => x.split(';')[0]).join('; ');

async function freshHandler(n: number) {
  // Reset MFA so each run starts from "first sign-in".
  const u = await prisma.user.findUniqueOrThrow({ where: { email: `handler${n}@speaksafe.test` } });
  await prisma.mfaFactor.deleteMany({ where: { userId: u.id } });
  return u;
}

async function signInWithSetup(n: number): Promise<Sess & { codes: string[]; secret: string }> {
  await freshHandler(n);
  const l = await request(app).post('/api/staff/login').send({ email: `handler${n}@speaksafe.test`, password: PW });
  expect(l.body.next).toBe('setup');
  const s = await request(app).post('/api/staff/mfa/setup').send({ token: l.body.token });
  expect(s.body.otpauth).toMatch(/^otpauth:\/\/totp\/SpeakSafe/);
  const c = await request(app).post('/api/staff/mfa/confirm').send({ token: l.body.token, code: authenticator.generate(s.body.secret) });
  expect(c.status).toBe(200);
  return { cookie: cookieOf(c), csrf: c.body.me.csrfToken, id: c.body.me.id, codes: c.body.recoveryCodes, secret: s.body.secret };
}

const as = (s: Sess) => ({
  get: (u: string) => request(app).get(u).set('Cookie', s.cookie),
  post: (u: string) => request(app).post(u).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf),
  patch: (u: string) => request(app).patch(u).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf),
});

let h1: Awaited<ReturnType<typeof signInWithSetup>>;
let h2: Awaited<ReturnType<typeof signInWithSetup>>;
let h3: Awaited<ReturnType<typeof signInWithSetup>>;
let caseId = '';
let reporter: Sess = { cookie: '', csrf: '', id: '' };
const caseAuthKey = b();

const DEMO = ['handler1@speaksafe.test', 'handler2@speaksafe.test', 'handler3@speaksafe.test'];
let paused: string[] = [];
afterAll(async () => {
  if (paused.length) await prisma.user.updateMany({ where: { id: { in: paused } }, data: { active: true } });
});

beforeAll(async () => {
  // These tests assume exactly three committee members; pause any others while they run.
  paused = (await prisma.user.findMany({ where: { role: 'HANDLER', active: true, email: { notIn: DEMO } }, select: { id: true } })).map((u) => u.id);
  if (paused.length) await prisma.user.updateMany({ where: { id: { in: paused } }, data: { active: false } });
  h1 = await signInWithSetup(1);
  h2 = await signInWithSetup(2);
  h3 = await signInWithSetup(3);
  // A reporter files a case, keeping handler3 away -> readers are handler1 and handler2.
  const rep = await request(app).post('/api/reporter/signup').send({
    username: `st-${randomBytes(3).toString('hex')}`, pwSalt: b(16), authKey: b(), masterKeyEnc: b(72),
    recSalt: b(16), recAuthKey: b(), masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
  });
  const rs = { cookie: cookieOf(rep), csrf: rep.body.csrfToken, id: '' };
  reporter = rs;
  const prep = await as(rs).post('/api/reports/prepare').send({ excluded: [h3.id] });
  const nonce = b(24); const ciphertext = b(100);
  const fingerprint = createHash('sha256').update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(ciphertext, 'base64')])).digest('hex');
  const cat = (await request(app).get('/api/categories')).body[0].id;
  const sub = await as(rs).post('/api/reports').send({
    token: prep.body.token, categoryId: cat, mode: 'ANONYMOUS', aboutOther: false, nonce, ciphertext, fingerprint,
    sealedKeys: Object.fromEntries(prep.body.readers.map((r: { id: string }) => [r.id, b(80)])),
    reporterPublicKey: b(), reporterSealedKey: b(80), caseAuthKey,
  });
  expect(sub.status).toBe(201);
  caseId = sub.body.caseId;
});

describe('staff sign-in and MFA', () => {
  it('rejects a wrong password with a generic message', async () => {
    const r = await request(app).post('/api/staff/login').send({ email: 'handler1@speaksafe.test', password: 'wrong' });
    const u = await request(app).post('/api/staff/login').send({ email: 'nobody@speaksafe.test', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe(u.body.error);
  });

  it('asks for the 6-digit code after the password, and refuses a replayed code', async () => {
    const l = await request(app).post('/api/staff/login').send({ email: 'handler1@speaksafe.test', password: PW });
    expect(l.body.next).toBe('mfa');
    // The code used during setup is in the same 30-second window: it must not work twice.
    const replay = await request(app).post('/api/staff/mfa/verify').send({ token: l.body.token, code: authenticator.generate(h1.secret) });
    expect(replay.status).toBe(401);
    const wrong = await request(app).post('/api/staff/mfa/verify').send({ token: l.body.token, code: '000000' });
    expect(wrong.status).toBe(401);
  });

  it('accepts each recovery code once only', async () => {
    const code = h1.codes[0];
    const l1 = await request(app).post('/api/staff/login').send({ email: 'handler1@speaksafe.test', password: PW });
    const ok = await request(app).post('/api/staff/mfa/verify').send({ token: l1.body.token, recoveryCode: code });
    expect(ok.status).toBe(200);
    expect(ok.body.me.recoveryCodesLeft).toBe(9);
    const l2 = await request(app).post('/api/staff/login').send({ email: 'handler1@speaksafe.test', password: PW });
    const again = await request(app).post('/api/staff/mfa/verify').send({ token: l2.body.token, recoveryCode: code });
    expect(again.status).toBe(401);
  });

  it('stores the authenticator secret encrypted, never in plain text', async () => {
    const m = await prisma.mfaFactor.findUniqueOrThrow({ where: { userId: h1.id } });
    expect(m.secretEnc).not.toContain(h1.secret);
  });

  it('requires a session, and the CSRF token for changes', async () => {
    expect((await request(app).get('/api/staff/cases')).status).toBe(401);
    expect((await request(app).post('/api/staff/ping').set('Cookie', h1.cookie)).status).toBe(403);
  });
});

describe('encrypted messages', () => {
  it('flows both ways, flags new messages, and can never be changed', async () => {
    const sent = await as(reporter).post(`/api/reporter/cases/${caseId}/messages`).set('X-Case-Auth', caseAuthKey).send({ nonce: b(24), ciphertext: b(60) });
    expect(sent.status).toBe(201);
    expect((await as(reporter).post(`/api/reporter/cases/${caseId}/messages`).set('X-Case-Auth', b()).send({ nonce: b(24), ciphertext: b(60) })).status).toBe(404);
    expect((await as(h2).get('/api/staff/cases')).body.find((c: { id: string }) => c.id === caseId).newMessage).toBe(true);
    const d = await as(h2).get(`/api/staff/cases/${caseId}`);
    expect(d.body.messages.at(-1).from).toBe('reporter');
    expect(d.body.templates.length).toBeGreaterThan(0);
    expect((await as(h2).get('/api/staff/cases')).body.find((c: { id: string }) => c.id === caseId).newMessage).toBe(false);
    expect((await as(h2).post(`/api/staff/cases/${caseId}/messages`).send({ nonce: b(24), ciphertext: b(60) })).status).toBe(201);
    expect((await as(h3).post(`/api/staff/cases/${caseId}/messages`).send({ nonce: b(24), ciphertext: b(60) })).status).toBe(404);
    const r = await as(reporter).get(`/api/reporter/cases/${caseId}`).set('X-Case-Auth', caseAuthKey);
    expect(r.body.messages.map((m: { from: string }) => m.from)).toEqual(['me', 'committee']);
    expect(r.body.firstViewedAt).toBeTruthy();
    await expect(prisma.message.update({ where: { id: sent.body.id }, data: { ciphertext: b(60) } })).rejects.toThrow();
    await expect(prisma.message.delete({ where: { id: sent.body.id } })).rejects.toThrow();
  });
});

describe('committee case work', () => {
  it('shows the case only to its readers, never to the excluded member', async () => {
    expect((await as(h1).get('/api/staff/cases')).body.map((c: { id: string }) => c.id)).toContain(caseId);
    expect((await as(h3).get('/api/staff/cases')).body.map((c: { id: string }) => c.id)).not.toContain(caseId);
    expect((await as(h3).get(`/api/staff/cases/${caseId}`)).status).toBe(404);
    const d = await as(h1).get(`/api/staff/cases/${caseId}`);
    expect(d.status).toBe(200);
    expect(d.body.sealedKey).toBeTruthy();
    expect(d.body.readers).toHaveLength(2);
  });

  it('logs every case view', async () => {
    const n = await prisma.auditLog.count({ where: { action: 'CASE_VIEWED', targetId: caseId, actorId: h1.id } });
    expect(n).toBeGreaterThan(0);
  });

  it('changes status within the working states only', async () => {
    expect((await as(h1).patch(`/api/staff/cases/${caseId}/status`).send({ status: 'UNDER_REVIEW' })).status).toBe(200);
    expect((await as(h1).patch(`/api/staff/cases/${caseId}/status`).send({ status: 'CLOSED' })).status).toBe(400);
  });

  it('adds notes that can never be edited or deleted', async () => {
    const n = await as(h1).post(`/api/staff/cases/${caseId}/notes`).send({ nonce: b(24), ciphertext: b(60) });
    expect(n.status).toBe(201);
    await expect(prisma.caseNote.update({ where: { id: n.body.id }, data: { ciphertext: b(60) } })).rejects.toThrow();
    await expect(prisma.caseNote.delete({ where: { id: n.body.id } })).rejects.toThrow();
  });

  it('needs a second member to approve closure', async () => {
    const r = await as(h1).post(`/api/staff/cases/${caseId}/closure`);
    expect(r.status).toBe(201);
    const d = await as(h1).get(`/api/staff/cases/${caseId}`);
    const cid = d.body.closures[0].id;
    expect((await as(h1).post(`/api/staff/cases/${caseId}/closure/${cid}/decision`).send({ approve: true })).status).toBe(403);
    expect((await as(h2).get('/api/staff/cases')).body.find((c: { id: string }) => c.id === caseId).needsMyApproval).toBe(true);
    const rej = await as(h2).post(`/api/staff/cases/${caseId}/closure/${cid}/decision`).send({ approve: false });
    expect(rej.body.status).toBe('UNDER_REVIEW');
  });

  it('never hands a recused case to an excluded member', async () => {
    // The only other member is handler3, who was excluded: recusal must be refused.
    const cand = await as(h2).get(`/api/staff/cases/${caseId}/recuse-candidate`);
    expect(cand.status).toBe(409);
  });
});
