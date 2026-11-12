import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const b = (n = 32) => randomBytes(n).toString('base64');
let cookie = '';
let csrf = '';
const agent = () => ({
  post: (u: string) => request(app).post(u).set('Cookie', cookie).set('X-CSRF-Token', csrf),
  get: (u: string) => request(app).get(u).set('Cookie', cookie),
  put: (u: string) => request(app).put(u).set('Cookie', cookie).set('X-CSRF-Token', csrf),
  del: (u: string) => request(app).delete(u).set('Cookie', cookie).set('X-CSRF-Token', csrf),
});

beforeAll(async () => {
  const res = await request(app).post('/api/reporter/signup').send({
    username: `rep-${randomBytes(3).toString('hex')}`, pwSalt: b(16), authKey: b(), masterKeyEnc: b(72),
    recSalt: b(16), recAuthKey: b(), masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
  });
  cookie = (res.headers['set-cookie'] as unknown as string[]).map((x) => x.split(';')[0]).join('; ');
  csrf = res.body.csrfToken;
});

describe('reports', () => {
  let caseId = '';
  const caseAuthKey = b();

  it('lists categories and committee members publicly', async () => {
    expect((await request(app).get('/api/categories')).body.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/committee')).body.length).toBeGreaterThanOrEqual(3);
  });

  it('requires a logged-in reporter', async () => {
    expect((await request(app).post('/api/reports/prepare').send({})).status).toBe(401);
  });

  it('never picks an excluded member, and refuses if fewer than 2 remain', async () => {
    const members = (await request(app).get('/api/committee')).body as { id: string }[];
    const r = await agent().post('/api/reports/prepare').send({ excluded: [members[0].id] });
    expect(r.status).toBe(200);
    expect(r.body.readers).toHaveLength(2);
    expect(r.body.readers.map((x: { id: string }) => x.id)).not.toContain(members[0].id);
    const tooMany = await agent().post('/api/reports/prepare').send({ excluded: members.slice(0, members.length - 1).map((m) => m.id) });
    expect(tooMany.status).toBe(409);
  });

  it('stores an encrypted report only with matching keys and fingerprint', async () => {
    const members = (await request(app).get('/api/committee')).body as { id: string }[];
    const prep = await agent().post('/api/reports/prepare').send({ excluded: [members[0].id] });
    const nonce = b(24);
    const ciphertext = b(200);
    const fingerprint = createHash('sha256').update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(ciphertext, 'base64')])).digest('hex');
    const cat = (await request(app).get('/api/categories')).body[0].id;
    const base = { token: prep.body.token, categoryId: cat, mode: 'ANONYMOUS', aboutOther: false, nonce, ciphertext, fingerprint, reporterPublicKey: b(), reporterSealedKey: b(80), caseAuthKey };
    const wrongKeys = await agent().post('/api/reports').send({ ...base, sealedKeys: { [members[0].id]: b(80), [prep.body.readers[0].id]: b(80) } });
    expect(wrongKeys.status).toBe(400);
    const sealedKeys = Object.fromEntries(prep.body.readers.map((r: { id: string }) => [r.id, b(80)]));
    const badFp = await agent().post('/api/reports').send({ ...base, sealedKeys, fingerprint: 'a'.repeat(64) });
    expect(badFp.status).toBe(400);
    const ok = await agent().post('/api/reports').send({ ...base, sealedKeys });
    expect(ok.status).toBe(201);
    expect(ok.body.caseId).toMatch(/^SS-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(ok.body.fingerprint).toBe(fingerprint);
    caseId = ok.body.caseId;
    const excl = await prisma.exclusion.findMany({ where: { caseId } });
    expect(excl.map((e) => e.handlerId)).toEqual([members[0].id]);
  });

  it('lets only the owner (per-case key) read the case', async () => {
    expect((await agent().get(`/api/reporter/cases/${caseId}`)).status).toBe(404);
    expect((await agent().get(`/api/reporter/cases/${caseId}`).set('X-Case-Auth', b())).status).toBe(404);
    const r = await agent().get(`/api/reporter/cases/${caseId}`).set('X-Case-Auth', caseAuthKey);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('RECEIVED');
  });

  it('accepts encrypted attachments of allowed types only', async () => {
    const body = randomBytes(500);
    const bad = await agent().post(`/api/reports/${caseId}/attachments`).set('X-Case-Auth', caseAuthKey)
      .set('X-Attachment-Kind', 'image').set('X-Attachment-Type', 'image/gif').set('Content-Type', 'application/octet-stream').send(body);
    expect(bad.status).toBe(400);
    const ok = await agent().post(`/api/reports/${caseId}/attachments`).set('X-Case-Auth', caseAuthKey)
      .set('X-Attachment-Kind', 'voice').set('X-Attachment-Type', 'audio/webm').set('Content-Type', 'application/octet-stream').send(body);
    expect(ok.status).toBe(201);
    const back = await agent().get(`/api/reporter/cases/${caseId}/attachments/${ok.body.id}`).set('X-Case-Auth', caseAuthKey).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(Buffer.compare(back.body as Buffer, body)).toBe(0);
  });

  it('cannot delete or rewrite a submitted case, even directly in the database', async () => {
    await expect(prisma.case.delete({ where: { id: caseId } })).rejects.toThrow();
    await expect(prisma.case.update({ where: { id: caseId }, data: { ciphertext: b(50) } })).rejects.toThrow();
    await expect(prisma.caseAccess.update({ where: { caseId }, data: { reporterSealedKey: b(80) } })).rejects.toThrow();
  });

  it('keeps an encrypted draft and its files, and deletes them on request', async () => {
    expect((await agent().put('/api/reporter/draft').send({ ciphertext: b(100) })).status).toBe(200);
    const f = await agent().post('/api/reporter/draft/files').set('Content-Type', 'application/octet-stream').send(randomBytes(100));
    expect(f.status).toBe(201);
    expect((await agent().get('/api/reporter/draft')).body.ciphertext).toBeTruthy();
    await agent().del('/api/reporter/draft');
    expect((await agent().get('/api/reporter/draft')).body).toBeNull();
    expect((await agent().get(`/api/reporter/draft/files/${f.body.id}`)).status).toBe(404);
  });

  it('stores the vault', async () => {
    const v = b(120);
    await agent().put('/api/reporter/vault').send({ vaultEnc: v });
    expect((await agent().get('/api/reporter/vault')).body.vaultEnc).toBe(v);
  });
});
