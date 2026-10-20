import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { roles, sessions, userRoles } from '#src/db/schema/index.js';
import { createApp } from '#src/app.js';
import { createBooking } from '#src/modules/bookings/bookings.service.js';
import {
  futureWindow,
  makeCustomerType,
  makeEquipment,
  makeLocation,
  makeOrganisation,
  makeUser,
  resetDatabase,
} from '../helpers.js';

/**
 * The back-office endpoints the admin panel depends on: dashboard, customers,
 * categories, single-item equipment, and the booking detail payload.
 */
describe('admin panel API', () => {
  const app = createApp();
  const HOST = 'admintest.test';
  const PASSWORD = 'correct-horse-battery';
  let org;
  let token;
  let customer;
  let item;
  let booking;

  const as = (t) => ({
    get: (path) => request(app).get(path).set('Host', HOST).set('Authorization', `Bearer ${t}`),
    post: (path) => request(app).post(path).set('Host', HOST).set('Authorization', `Bearer ${t}`),
    put: (path) => request(app).put(path).set('Host', HOST).set('Authorization', `Bearer ${t}`),
    patch: (path) => request(app).patch(path).set('Host', HOST).set('Authorization', `Bearer ${t}`),
  });

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    org = await makeOrganisation({ slug: 'admintest' });
    await makeLocation(org);

    const owner = await makeUser(org, { email: 'owner@test.local', password: PASSWORD });
    const [role] = await db
      .insert(roles)
      .values({ organisationId: org.id, code: 'OWNER', name: 'Owner', isSystem: true })
      .returning();
    await db.insert(userRoles).values({ userId: owner.id, roleId: role.id });

    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .set('Host', HOST)
      .send({ email: 'owner@test.local', password: PASSWORD })
      .expect(200);
    token = login.body.data.accessToken;

    const type = await makeCustomerType(org);
    customer = await makeUser(org, {
      email: 'customer@test.local',
      password: PASSWORD,
      firstName: 'Casey',
      customerTypeId: type.id,
    });
    item = await makeEquipment(org, { unitCount: 2, name: 'Marquee' });
    const w = futureWindow();
    ({ booking } = await createBooking({
      org,
      user: customer,
      input: {
        items: [{ equipmentId: item.id, quantity: 1 }],
        startDate: w.startDate,
        endDate: w.endDate,
        startTime: '09:00',
        endTime: '17:00',
        deliveryRequired: false,
        answers: [],
        acceptTerms: true,
      },
    }));
  });

  it('never sends a password hash in the booking detail', async () => {
    const res = await as(token).get(`/api/v1/admin/bookings/${booking.id}`).expect(200);
    expect(res.body.data.user.email).toBe('customer@test.local');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('counts bookings awaiting review on the dashboard', async () => {
    const res = await as(token).get('/api/v1/admin/dashboard').expect(200);
    expect(res.body.data.counts.pendingReview).toBe(1);
    expect(res.body.data.recent[0].reference).toBe(booking.reference);
  });

  it('rejects a customer-site token on admin routes', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Host', HOST)
      .send({ email: 'customer@test.local', password: PASSWORD })
      .expect(200);
    await as(login.body.data.accessToken).get('/api/v1/admin/dashboard').expect(401);
  });

  it('lists customers but not staff', async () => {
    const res = await as(token).get('/api/v1/admin/customers').expect(200);
    const emails = res.body.data.map((c) => c.email);
    expect(emails).toContain('customer@test.local');
    expect(emails).not.toContain('owner@test.local');
    expect(res.body.data[0].bookingCount).toBe(1);
  });

  it('confirms a customer type, and resets confirmation when the type changes', async () => {
    let res = await as(token)
      .patch(`/api/v1/admin/customers/${customer.id}`)
      .send({ confirmCustomerType: true })
      .expect(200);
    expect(res.body.data.customerTypeConfirmed).toBe(true);

    const other = await makeCustomerType(org, { code: 'SCHOOL', name: 'School' });
    res = await as(token)
      .patch(`/api/v1/admin/customers/${customer.id}`)
      .send({ customerTypeId: other.id })
      .expect(200);
    expect(res.body.data.customerTypeConfirmed).toBe(false);
  });

  it('signs a blocked customer out everywhere', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .set('Host', HOST)
      .send({ email: 'customer@test.local', password: PASSWORD })
      .expect(200);

    await as(token)
      .patch(`/api/v1/admin/customers/${customer.id}`)
      .send({ blocked: true, blockedReason: 'Unpaid damage' })
      .expect(200);

    const live = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, customer.id), isNull(sessions.revokedAt)));
    expect(live).toHaveLength(0);
  });

  it('returns one equipment item with its prices and units', async () => {
    const res = await as(token).get(`/api/v1/admin/equipment/${item.id}`).expect(200);
    expect(res.body.data.name).toBe('Marquee');
    expect(res.body.data.units).toHaveLength(2);
    expect(res.body.data.prices[0].amountCents).toBe(5000);
    expect(res.body.data.blocks).toEqual([]);
  });

  it('creates categories and refuses a duplicate web address', async () => {
    await as(token)
      .post('/api/v1/admin/categories')
      .send({ name: 'Marquees and shelter' })
      .expect(201);
    const res = await as(token)
      .post('/api/v1/admin/categories')
      .send({ name: 'Another', slug: 'marquees-and-shelter' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('lists bookings overlapping a calendar window', async () => {
    const w = futureWindow();
    const res = await as(token)
      .get('/api/v1/admin/calendar')
      .query({ from: w.startDate, to: w.endDate })
      .expect(200);
    expect(res.body.data.map((b) => b.reference)).toContain(booking.reference);
  });
});
