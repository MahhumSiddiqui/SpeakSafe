import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';

const app = createApp();
const b = (n = 32) => randomBytes(n).toString('base64');
const name = `test-${randomBytes(4).toString('hex')}`;
const pw = { pwSalt: b(16), authKey: b() };
const rec = { recSalt: b(16), recAuthKey: b() };

function cookieOf(res: request.Response) {
  const c = res.headers['set-cookie'] as unknown as string[];
  return c.map((x) => x.split(';')[0]).join('; ');
}

describe('reporter private space', () => {
  let cookie = '';
  let csrf = '';

  beforeAll(async () => {
    const res = await request(app).post('/api/reporter/signup').send({
      username: name, ...pw, masterKeyEnc: b(72), ...rec, masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
    });
    expect(res.status).toBe(201);
    cookie = cookieOf(res);
    csrf = res.body.csrfToken;
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
  });

  it('rejects a duplicate username', async () => {
    const res = await request(app).post('/api/reporter/signup').send({
      username: name, ...pw, masterKeyEnc: b(72), ...rec, masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
    });
    expect(res.status).toBe(409);
  });

  it('rejects invalid usernames', async () => {
    const res = await request(app).post('/api/reporter/prelogin').send({ username: 'bad name!' });
    expect(res.status).toBe(400);
  });

  it('prelogin returns the real salt, and a stable fake salt for unknown users', async () => {
    const real = await request(app).post('/api/reporter/prelogin').send({ username: name });
    expect(real.body.pwSalt).toBe(pw.pwSalt);
    const f1 = await request(app).post('/api/reporter/prelogin').send({ username: 'nobody-here-1' });
    const f2 = await request(app).post('/api/reporter/prelogin').send({ username: 'nobody-here-1' });
    expect(f1.body.pwSalt).toBe(f2.body.pwSalt);
    expect(Buffer.from(f1.body.pwSalt, 'base64')).toHaveLength(16);
  });

  it('logs in only with the right auth key, with the same message for unknown users', async () => {
    const bad = await request(app).post('/api/reporter/login').send({ username: name, authKey: b() });
    const unknown = await request(app).post('/api/reporter/login').send({ username: 'nobody-here-2', authKey: b() });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
    const ok = await request(app).post('/api/reporter/login').send({ username: name, authKey: pw.authKey });
    expect(ok.status).toBe(200);
    expect(ok.body.masterKeyEnc).toBeTruthy();
  });

  it('needs a session for /me and a CSRF token for changes', async () => {
    expect((await request(app).get('/api/reporter/me')).status).toBe(401);
    const me = await request(app).get('/api/reporter/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(name);
    expect((await request(app).post('/api/reporter/ping').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).post('/api/reporter/ping').set('Cookie', cookie).set('X-CSRF-Token', csrf)).status).toBe(200);
  });

  it('resets the password with recovery words and logs out old sessions', async () => {
    const wrong = await request(app).post('/api/reporter/recover/verify').send({ username: name, recAuthKey: b() });
    expect(wrong.status).toBe(401);
    const v = await request(app).post('/api/reporter/recover/verify').send({ username: name, recAuthKey: rec.recAuthKey });
    expect(v.status).toBe(200);
    const newPw = { pwSalt: b(16), authKey: b(), masterKeyEnc: b(72) };
    const r = await request(app).post('/api/reporter/recover/reset').send({ resetToken: v.body.resetToken, ...newPw });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/reporter/me').set('Cookie', cookie)).status).toBe(401);
    const old = await request(app).post('/api/reporter/login').send({ username: name, authKey: pw.authKey });
    expect(old.status).toBe(401);
    const fresh = await request(app).post('/api/reporter/login').send({ username: name, authKey: newPw.authKey });
    expect(fresh.status).toBe(200);
  });

  it('rejects a forged reset token', async () => {
    const r = await request(app).post('/api/reporter/recover/reset').send({ resetToken: 'abc.def', pwSalt: b(16), authKey: b(), masterKeyEnc: b(72) });
    expect(r.status).toBe(401);
  });

  it('logout ends the session', async () => {
    const login = await request(app).post('/api/reporter/signup').send({
      username: name + '-b', ...pw, masterKeyEnc: b(72), ...rec, masterKeyRecEnc: b(72), publicKey: b(), secretKeyEnc: b(72),
    });
    const c = cookieOf(login);
    expect((await request(app).get('/api/reporter/me').set('Cookie', c)).status).toBe(200);
    await request(app).post('/api/reporter/logout').set('Cookie', c);
    expect((await request(app).get('/api/reporter/me').set('Cookie', c)).status).toBe(401);
  });
});
