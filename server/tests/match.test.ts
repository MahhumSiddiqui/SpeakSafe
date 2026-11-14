import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'node:crypto';
import _sodium from 'libsodium-wrappers-sumo';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PW = process.env.STAFF_PASSWORD ?? 'Local-Test-Pass-1';
const b = (n = 32) => randomBytes(n).toString('base64');
const cookieOf = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[]).map((x) => x.split(';')[0]).join('; ');
type Sess = { cookie: string; csrf: string; id: string };
const as = (s: Sess) => ({
  get: (u: string) => request(app).get(u).set('Cookie', s.cookie),
  post: (u: string) => request(app).post(u).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf),
});

async function reporter(): Promise<Sess> {
  const r = await request(app).post('/api/reporter/signup').send({
    username: `na-${randomBytes(4).toString('hex')}`, pwSalt: b(16), authKey: b(), masterKeyEnc: b(72),
    recSalt: b(16), recAuthKey: b(), masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
  });
  return { cookie: cookieOf(r), csrf: r.body.csrfToken, id: '' };
}

async function handler(n: number): Promise<Sess> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: `handler${n}@speaksafe.test` } });
  await prisma.mfaFactor.deleteMany({ where: { userId: u.id } });
  const l = await request(app).post('/api/staff/login').send({ email: u.email, password: PW });
  const s = await request(app).post('/api/staff/mfa/setup').send({ token: l.body.token });
  const c = await request(app).post('/api/staff/mfa/confirm').send({ token: l.body.token, code: authenticator.generate(s.body.secret) });
  return { cookie: cookieOf(c), csrf: c.body.me.csrfToken, id: c.body.me.id };
}

/** What the browser does: blind H(id), ask the server, unblind, hash to a token. */
async function tokenFor(rep: Sess, id: string) {
  await _sodium.ready;
  const s = _sodium;
  const norm = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const P = s.crypto_core_ristretto255_from_hash(s.crypto_generichash(64, `speaksafe-not-alone:${norm}`));
  const r = s.crypto_core_ristretto255_scalar_random();
  const blinded = s.crypto_scalarmult_ristretto255(r, P);
  const res = await as(rep).post('/api/match/evaluate').send({ blinded: Buffer.from(blinded).toString('base64') });
  expect(res.status).toBe(200);
  const U = s.crypto_scalarmult_ristretto255(s.crypto_core_ristretto255_scalar_invert(r), new Uint8Array(Buffer.from(res.body.evaluated, 'base64')));
  return Buffer.from(s.crypto_generichash(32, new Uint8Array([...Buffer.from(`speaksafe-match-token:${norm}:`), ...U]))).toString('base64');
}

async function submit(rep: Sess, extra: Record<string, unknown>) {
  const prep = await as(rep).post('/api/reports/prepare').send({ excluded: [] });
  const nonce = b(24);
  const ciphertext = b(200);
  const fingerprint = createHash('sha256').update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(ciphertext, 'base64')])).digest('hex');
  const cat = (await request(app).get('/api/categories')).body[0].id;
  const caseAuthKey = b();
  const res = await as(rep).post('/api/reports').send({
    token: prep.body.token, categoryId: cat, mode: 'ANONYMOUS', aboutOther: false, nonce, ciphertext, fingerprint,
    sealedKeys: Object.fromEntries(prep.body.readers.map((x: { id: string }) => [x.id, b(80)])), reporterPublicKey: b(), reporterSealedKey: b(80), caseAuthKey, ...extra,
  });
  return { res, caseAuthKey, readers: prep.body.readers.map((x: { id: string }) => x.id) as string[] };
}

const DEMO = ['handler1@speaksafe.test', 'handler2@speaksafe.test', 'handler3@speaksafe.test'];
let paused: string[] = [];
let staff: Record<string, Sess> = {};
beforeAll(async () => {
  paused = (await prisma.user.findMany({ where: { role: 'HANDLER', active: true, email: { notIn: DEMO } }, select: { id: true } })).map((u) => u.id);
  if (paused.length) await prisma.user.updateMany({ where: { id: { in: paused } }, data: { active: false } });
  for (const n of [1, 2, 3]) { const h = await handler(n); staff[h.id] = h; }
});
afterAll(async () => {
  if (paused.length) await prisma.user.updateMany({ where: { id: { in: paused } }, data: { active: true } });
});

describe('"Not alone" matching', () => {
  const ID = `EMP-${randomBytes(3).toString('hex')}`; // unique per run so old test data never matches
  let ayesha: Sess, sara: Sess;
  let held: { id: string; auth: string; readers: string[] };

  beforeAll(async () => {
    ayesha = await reporter();
    sara = await reporter();
  });

  it('only accepts a blinded point from a signed-in reporter', async () => {
    expect((await request(app).post('/api/match/evaluate').send({ blinded: b() })).status).toBe(401);
    const bad = await as(ayesha).post('/api/match/evaluate').send({ blinded: Buffer.alloc(32, 0xff).toString('base64') });
    expect(bad.status).toBe(400);
    expect((await as(ayesha).post('/api/match/evaluate').send({ blinded: 'EMP-1043' })).status).toBe(400);
  });

  it('gives the same token for the same ID however it is written, and different ones otherwise', async () => {
    const t1 = await tokenFor(ayesha, ID.toLowerCase());
    const t2 = await tokenFor(sara, ` ${ID.replace('-', ' ')} `);
    const t3 = await tokenFor(sara, `${ID}9`);
    expect(t1).toBe(t2);
    expect(t1).not.toBe(t3);
  });

  it('refuses to hold a report without a token', async () => {
    const { res } = await submit(ayesha, { hold: true });
    expect(res.status).toBe(400);
  });

  it('a held report is invisible to its committee readers', async () => {
    const { res, caseAuthKey, readers } = await submit(ayesha, { hold: true, matchToken: await tokenFor(ayesha, ID) });
    expect(res.status).toBe(201);
    expect(res.body.held).toBe(true);
    expect(res.body.notAlone).toBe(false);
    held = { id: res.body.caseId, auth: caseAuthKey, readers };
    for (const r of readers) {
      const list = await as(staff[r]).get('/api/staff/cases');
      expect(list.body.map((c: { id: string }) => c.id)).not.toContain(held.id);
      expect((await as(staff[r]).get(`/api/staff/cases/${held.id}`)).status).toBe(404);
    }
    const mine = await as(ayesha).get(`/api/reporter/cases/${held.id}`).set('X-Case-Auth', caseAuthKey);
    expect(mine.body.held).toBe(true);
    const tag = await prisma.matchTag.findUniqueOrThrow({ where: { caseId: held.id } });
    expect(tag.token).not.toContain(ID);
  });

  it('a second report naming the same person releases both, linked', async () => {
    const { res, readers } = await submit(sara, { matchToken: await tokenFor(sara, ID.toLowerCase()) });
    expect(res.status).toBe(201);
    expect(res.body.notAlone).toBe(true);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: held.id } })).held).toBe(false);
    const mine = await as(ayesha).get(`/api/reporter/cases/${held.id}`).set('X-Case-Auth', held.auth);
    expect(mine.body.held).toBe(false);
    expect(mine.body.notAlone).toBe(1);
    const r = held.readers[0];
    const list = await as(staff[r]).get('/api/staff/cases');
    const row = list.body.find((c: { id: string }) => c.id === held.id);
    expect(row.linked).toBe(1);
    const detail = await as(staff[r]).get(`/api/staff/cases/${held.id}`);
    expect(detail.body.linked).toHaveLength(1);
    expect(detail.body.linked[0].id).toBe(readers.includes(r) ? res.body.caseId : null);
    const log = await prisma.auditLog.findFirst({ where: { action: 'CASE_RELEASED', targetId: held.id } });
    expect(log?.actorType).toBe('SYSTEM');
  });

  it('the reporter can send a held report without waiting', async () => {
    const { res, caseAuthKey, readers } = await submit(ayesha, { hold: true, matchToken: await tokenFor(ayesha, `${ID}-other`) });
    expect(res.body.held).toBe(true);
    expect((await as(sara).post(`/api/reporter/cases/${res.body.caseId}/release`).set('X-Case-Auth', b())).status).toBe(404);
    const rel = await as(ayesha).post(`/api/reporter/cases/${res.body.caseId}/release`).set('X-Case-Auth', caseAuthKey);
    expect(rel.status).toBe(200);
    expect((await as(staff[readers[0]]).get(`/api/staff/cases/${res.body.caseId}`)).status).toBe(200);
  });

  it('the database refuses to hide a released report again, or to change a token', async () => {
    await expect(prisma.case.update({ where: { id: held.id }, data: { held: true } })).rejects.toThrow(/cannot be held again/);
    await expect(prisma.matchTag.update({ where: { caseId: held.id }, data: { token: 'x' } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.matchTag.delete({ where: { caseId: held.id } })).rejects.toThrow(/not allowed/);
  });
});
