import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const b = (n = 32) => randomBytes(n).toString('base64');

async function newAccount() {
  const res = await request(app).post('/api/reporter/signup').send({
    username: `jt-${randomBytes(4).toString('hex')}`, pwSalt: b(16), authKey: b(), masterKeyEnc: b(72),
    recSalt: b(16), recAuthKey: b(), masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
  });
  expect(res.status).toBe(201);
  const cookie = (res.headers['set-cookie'] as unknown as string[]).map((x) => x.split(';')[0]).join('; ');
  return { cookie, csrf: res.body.csrfToken as string };
}

describe('private journal and evidence locker', () => {
  let a: { cookie: string; csrf: string };
  let other: { cookie: string; csrf: string };
  let entryId = '';
  let fileId = '';

  beforeAll(async () => {
    a = await newAccount();
    other = await newAccount();
  });

  it('needs a signed-in reporter', async () => {
    expect((await request(app).get('/api/reporter/journal/entries')).status).toBe(401);
  });

  it('needs the CSRF token to write', async () => {
    const r = await request(app).post('/api/reporter/journal/entries').set('Cookie', a.cookie).send({ ciphertext: b(100) });
    expect(r.status).toBe(403);
  });

  it('stores, lists, updates and deletes encrypted entries', async () => {
    const ct = b(200);
    const add = await request(app).post('/api/reporter/journal/entries').set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf).send({ ciphertext: ct });
    expect(add.status).toBe(201);
    entryId = add.body.id;
    const list = await request(app).get('/api/reporter/journal/entries').set('Cookie', a.cookie);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].ciphertext).toBe(ct);
    const ct2 = b(220);
    const upd = await request(app).put(`/api/reporter/journal/entries/${entryId}`).set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf).send({ ciphertext: ct2 });
    expect(upd.status).toBe(200);
    const row = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.ciphertext).toBe(ct2);
  });

  it('rejects text that is not encrypted data', async () => {
    const r = await request(app).post('/api/reporter/journal/entries').set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf).send({ ciphertext: 'He said something on Monday at the library' });
    expect(r.status).toBe(400);
  });

  it('keeps each journal private to its owner', async () => {
    const list = await request(app).get('/api/reporter/journal/entries').set('Cookie', other.cookie);
    expect(list.body).toHaveLength(0);
    const upd = await request(app).put(`/api/reporter/journal/entries/${entryId}`).set('Cookie', other.cookie).set('X-CSRF-Token', other.csrf).send({ ciphertext: b(100) });
    expect(upd.status).toBe(404);
    const del = await request(app).delete(`/api/reporter/journal/entries/${entryId}`).set('Cookie', other.cookie).set('X-CSRF-Token', other.csrf);
    expect(del.status).toBe(404);
  });

  it('stores locker files with encrypted descriptions, private to the owner', async () => {
    const bytes = randomBytes(5000);
    const up = await request(app).post('/api/reporter/journal/files').set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf)
      .set('X-Locker-Meta', b(80)).set('Content-Type', 'application/octet-stream').send(bytes);
    expect(up.status).toBe(201);
    fileId = up.body.id;
    const list = await request(app).get('/api/reporter/journal/files').set('Cookie', a.cookie);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('ciphertext');
    const got = await request(app).get(`/api/reporter/journal/files/${fileId}`).set('Cookie', a.cookie).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(Buffer.compare(got.body as Buffer, bytes)).toBe(0);
    expect((await request(app).get(`/api/reporter/journal/files/${fileId}`).set('Cookie', other.cookie)).status).toBe(404);
  });

  it('refuses a locker file without its encrypted description', async () => {
    const up = await request(app).post('/api/reporter/journal/files').set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf)
      .set('Content-Type', 'application/octet-stream').send(randomBytes(500));
    expect(up.status).toBe(400);
  });

  it('lets the owner delete entries and files', async () => {
    expect((await request(app).delete(`/api/reporter/journal/entries/${entryId}`).set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf)).status).toBe(200);
    expect((await request(app).delete(`/api/reporter/journal/files/${fileId}`).set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf)).status).toBe(200);
    expect(await prisma.journalEntry.count({ where: { id: entryId } })).toBe(0);
  });

  it('rejects malformed IDs', async () => {
    const r = await request(app).delete('/api/reporter/journal/entries/not-an-id').set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf);
    expect(r.status).toBe(400);
  });
});
