import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { sessions, users } from '#src/db/schema/index.js';
import { createApp } from '#src/app.js';
import { makeOrganisation, makeUser, resetDatabase } from '../helpers.js';

/**
 * Auth, through the real HTTP stack.
 *
 * Mounted with supertest rather than calling the service, because the things
 * most likely to break — cookie flags, the tenant host header, which audience
 * a token is valid for — only exist at this layer.
 */
describe('authentication', () => {
  const app = createApp();
  let org;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    org = await makeOrganisation({ slug: 'authtest' });
  });

  // Every request carries a Host so the tenant middleware can resolve the
  // organisation, exactly as the hosting proxy would in production.
  const HOST = 'authtest.test';
  const api = {
    get: (path) => request(app).get(path).set('Host', HOST),
    post: (path) => request(app).post(path).set('Host', HOST),
  };

  describe('registration', () => {
    const payload = {
      email: 'new@test.local',
      password: 'a-long-enough-passphrase',
      firstName: 'Jo',
      lastName: 'Bloggs',
      phone: '0412 345 678',
      acceptTerms: true,
    };

    it('creates an account and returns an access token', async () => {
      const res = await api.post('/api/v1/auth/register').send(payload).expect(201);

      expect(res.body.data.user.email).toBe('new@test.local');
      expect(res.body.data.accessToken).toBeTruthy();
      // The password hash must never leave the server.
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
    });

    it('sets an httpOnly refresh cookie scoped to the auth path', async () => {
      const res = await api.post('/api/v1/auth/register').send(payload).expect(201);
      const cookie = res.headers['set-cookie'].find((c) => c.startsWith('rt_web='));

      expect(cookie).toBeTruthy();
      expect(cookie).toMatch(/HttpOnly/i);
      // Scoped so the customer site's cookie is never sent to admin routes.
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      // No admin cookie is issued by a customer registration.
      expect(res.headers['set-cookie'].some((c) => c.startsWith('rt_admin='))).toBe(false);
    });

    /**
     * Registering an email that already exists must look exactly like an
     * ordinary outcome. Otherwise the form is an oracle for "who has an
     * account here?", which for a community organisation is a membership list.
     */
    it('does not reveal whether an email is already registered', async () => {
      await makeUser(org, { email: 'taken@test.local' });
      const res = await api
        .post('/api/v1/auth/register')
        .send({ ...payload, email: 'taken@test.local' })
        .expect(202);

      expect(res.body.data.message).toMatch(/check your email/i);
      expect(res.body.data.accessToken).toBeUndefined();
      // No second account was created.
      const rows = await db.select().from(users).where(eq(users.email, 'taken@test.local'));
      expect(rows).toHaveLength(1);
    });

    it('rejects a short password with a helpful message', async () => {
      const res = await api
        .post('/api/v1/auth/register')
        .send({ ...payload, password: 'short' })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details[0].message).toMatch(/at least 12 characters/i);
    });

    it('rejects registration without accepting the terms', async () => {
      const res = await api
        .post('/api/v1/auth/register')
        .send({ ...payload, acceptTerms: false })
        .expect(422);
      expect(res.body.error.details.some((d) => /accept the terms/i.test(d.message))).toBe(true);
    });
  });

  describe('sign in', () => {
    beforeEach(async () => {
      await makeUser(org, { email: 'sam@test.local', password: 'correct-horse-battery' });
    });

    it('signs in with the right password', async () => {
      const res = await api
        .post('/api/v1/auth/login')
        .send({ email: 'sam@test.local', password: 'correct-horse-battery' })
        .expect(200);
      expect(res.body.data.accessToken).toBeTruthy();
    });

    it('is case-insensitive about the email address', async () => {
      await api
        .post('/api/v1/auth/login')
        .send({ email: 'SAM@Test.Local', password: 'correct-horse-battery' })
        .expect(200);
    });

    /**
     * The same message for both failure modes, so timing and wording cannot be
     * used to enumerate accounts.
     */
    it('gives the same answer for a wrong password and an unknown account', async () => {
      const wrongPassword = await api
        .post('/api/v1/auth/login')
        .send({ email: 'sam@test.local', password: 'wrong-password-entirely' })
        .expect(401);
      const noSuchUser = await api
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.local', password: 'wrong-password-entirely' })
        .expect(401);

      expect(wrongPassword.body.error.message).toBe(noSuchUser.body.error.message);
    });

    it('refuses a suspended account', async () => {
      await db
        .update(users)
        .set({ blockedAt: new Date(), blockedReason: 'Unreturned equipment' })
        .where(eq(users.email, 'sam@test.local'));

      const res = await api
        .post('/api/v1/auth/login')
        .send({ email: 'sam@test.local', password: 'correct-horse-battery' })
        .expect(403);
      expect(res.body.error.message).toMatch(/suspended/i);
    });

    /**
     * A customer with no staff role must not be able to sign into the admin
     * panel — and must not be told that the account exists either.
     */
    it('refuses a customer at the admin panel', async () => {
      await api
        .post('/api/v1/admin/auth/login')
        .send({ email: 'sam@test.local', password: 'correct-horse-battery' })
        .expect(401);
    });
  });

  describe('token rotation and reuse detection', () => {
    let agent;

    beforeEach(async () => {
      await makeUser(org, { email: 'rot@test.local', password: 'correct-horse-battery' });
      agent = request.agent(app);
      await agent
        .post('/api/v1/auth/login')
        .set('Host', 'authtest.test')
        .send({ email: 'rot@test.local', password: 'correct-horse-battery' })
        .expect(200);
    });

    it('issues a new refresh token on every refresh', async () => {
      const res = await agent
        .post('/api/v1/auth/refresh')
        .set('Host', 'authtest.test')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(res.body.data.accessToken).toBeTruthy();

      const rows = await db.select().from(sessions);
      // The original is retired, a replacement is live.
      expect(rows.filter((r) => r.revokedReason === 'ROTATED')).toHaveLength(1);
      expect(rows.filter((r) => !r.revokedAt)).toHaveLength(1);
    });

    /**
     * The security property that makes rotation worth having: presenting an
     * already-rotated token means it was captured, so the entire session
     * family is revoked rather than just the one token.
     */
    it('revokes the whole session family when a token is replayed', async () => {
      // Capture the cookie, then rotate normally.
      const login = await request(app)
        .post('/api/v1/auth/login')
        .set('Host', 'authtest.test')
        .send({ email: 'rot@test.local', password: 'correct-horse-battery' });
      const stolen = login.headers['set-cookie'].find((c) => c.startsWith('rt_web='));

      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Host', 'authtest.test')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', stolen)
        .expect(200);

      // Replay the same token: it has already been rotated.
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Host', 'authtest.test')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', stolen)
        .expect(401);

      // Every session descended from that login is now dead, including the
      // attacker's freshly issued one.
      const familyRows = await db.select().from(sessions);
      const reuseRevoked = familyRows.filter((r) => r.revokedReason === 'TOKEN_REUSE_DETECTED');
      expect(reuseRevoked.length).toBeGreaterThan(0);
    });

    it('rejects a refresh from an untrusted origin', async () => {
      await agent
        .post('/api/v1/auth/refresh')
        .set('Host', 'authtest.test')
        .set('Origin', 'https://evil.example.com')
        .expect(403);
    });

    it('revokes the family on sign-out', async () => {
      await agent
        .post('/api/v1/auth/logout')
        .set('Host', 'authtest.test')
        .set('Origin', 'http://localhost:5173')
        .expect(204);

      const rows = await db.select().from(sessions);
      expect(rows.every((r) => r.revokedAt)).toBe(true);
    });
  });

  describe('protected routes', () => {
    it('refuses a request with no token', async () => {
      const res = await api.get('/api/v1/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refuses a forged token', async () => {
      await api.get('/api/v1/me').set('Authorization', 'Bearer not.a.real.token').expect(401);
    });

    /**
     * Audience separation: a token minted for the customer site must not open
     * an admin route, even for a user who is staff. This is what stops an XSS
     * bug on the public site from reaching the back office.
     */
    it('refuses a customer-site token at an admin route', async () => {
      await makeUser(org, { email: 'aud@test.local', password: 'correct-horse-battery' });
      const login = await api
        .post('/api/v1/auth/login')
        .send({ email: 'aud@test.local', password: 'correct-horse-battery' })
        .expect(200);

      await api
        .get('/api/v1/admin/bookings')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(401);
    });

    it('returns the signed-in user', async () => {
      await makeUser(org, { email: 'me@test.local', password: 'correct-horse-battery' });
      const login = await api
        .post('/api/v1/auth/login')
        .send({ email: 'me@test.local', password: 'correct-horse-battery' })
        .expect(200);

      const res = await api
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(200);
      expect(res.body.data.user.email).toBe('me@test.local');
    });
  });

  describe('infrastructure', () => {
    it('answers /health without touching the database', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('returns a request id on every error, for support', async () => {
      const res = await api.get('/api/v1/does-not-exist').expect(404);
      expect(res.body.error.requestId).toBeTruthy();
      expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
    });

    it('rejects malformed JSON with 400, not 500', async () => {
      const res = await api
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": broken')
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });
});
