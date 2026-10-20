import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { availabilityBlocks, bookings } from '#src/db/schema/index.js';
import { createBooking } from '#src/modules/bookings/bookings.service.js';
import { updateSettings } from '#src/modules/settings/settings.service.js';
import {
  futureWindow,
  makeEquipment,
  makeLocation,
  makeOrganisation,
  makeUser,
  resetDatabase,
} from '../helpers.js';

/**
 * The concurrency guarantee.
 *
 * This is the test that matters most in the whole suite. A hire system that
 * double-books is worse than no system: two groups turn up on Saturday morning
 * for the same marquee, and the organisation's reputation takes the damage.
 *
 * The protection is a GiST exclusion constraint in the database
 * (drizzle/0002_integrity.sql), not an availability check in application code.
 * These tests fire genuinely simultaneous requests to prove the difference:
 * a check-then-insert would let several through, whereas the constraint lets
 * exactly as many through as there are units.
 */
describe('double-booking prevention', () => {
  let org;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    org = await makeOrganisation();
    await makeLocation(org);
    // Raise the per-customer cap so it is not what limits these tests.
    await updateSettings(org.id, { 'booking.maxActiveBookingsPerCustomer': 50 });
  });

  const submit = (user, item, window, quantity = 1) =>
    createBooking({
      org,
      user,
      input: {
        items: [{ equipmentId: item.id, quantity }],
        startDate: window.startDate,
        endDate: window.endDate,
        startTime: window.startTime ?? '09:00',
        endTime: window.endTime ?? '17:00',
        deliveryRequired: false,
        answers: [],
        acceptTerms: true,
      },
    });

  it('lets exactly one of ten simultaneous requests take the only unit', async () => {
    const item = await makeEquipment(org, { unitCount: 1, name: 'The Only Marquee' });
    const window = futureWindow();

    // Ten different customers, so no per-customer limit interferes.
    const customers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeUser(org, { email: `racer${i}@test.local` })),
    );

    // Promise.allSettled, not a loop: these must overlap in time, which is the
    // only way to exercise the constraint.
    const results = await Promise.allSettled(customers.map((u) => submit(u, item, window)));

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);

    // And the loser is told something useful, not "internal server error".
    for (const failure of lost) {
      expect(failure.reason.status, failure.reason.message).toBe(409);
    }

    // One booking, one active block. No orphans from the nine rollbacks.
    const rows = await db.select().from(bookings).where(eq(bookings.organisationId, org.id));
    expect(rows).toHaveLength(1);

    const blocks = await db
      .select()
      .from(availabilityBlocks)
      .where(
        and(eq(availabilityBlocks.equipmentId, item.id), eq(availabilityBlocks.isActive, true)),
      );
    expect(blocks).toHaveLength(1);
  });

  it('lets exactly three of ten simultaneous requests through when there are three units', async () => {
    const item = await makeEquipment(org, { unitCount: 3 });
    const window = futureWindow();
    const customers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeUser(org, { email: `three${i}@test.local` })),
    );

    const results = await Promise.allSettled(customers.map((u) => submit(u, item, window)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);

    // Each winner holds a distinct unit — no unit is allocated twice.
    const blocks = await db
      .select()
      .from(availabilityBlocks)
      .where(
        and(eq(availabilityBlocks.equipmentId, item.id), eq(availabilityBlocks.isActive, true)),
      );
    const unitIds = blocks.map((b) => b.unitId);
    expect(new Set(unitIds).size).toBe(3);
  });

  it('does not over-allocate a bulk pool under concurrent load', async () => {
    // 100 chairs; ten customers each asking for 30. Only three can fit.
    const item = await makeEquipment(org, {
      inventoryMode: 'BULK',
      bulkQuantity: 100,
      unitCount: 0,
      name: 'Folding chairs',
      maxPerBooking: 100,
    });
    const window = futureWindow();
    const customers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeUser(org, { email: `bulk${i}@test.local` })),
    );

    const results = await Promise.allSettled(customers.map((u) => submit(u, item, window, 30)));
    const won = results.filter((r) => r.status === 'fulfilled');
    expect(won).toHaveLength(3);

    // The invariant: never more reserved than exists.
    const blocks = await db
      .select()
      .from(availabilityBlocks)
      .where(
        and(eq(availabilityBlocks.equipmentId, item.id), eq(availabilityBlocks.isActive, true)),
      );
    const reserved = blocks.reduce((sum, b) => sum + b.quantity, 0);
    expect(reserved).toBe(90);
    expect(reserved).toBeLessThanOrEqual(100);
  });

  it('allows a back-to-back hire starting the exact moment the previous one ends', async () => {
    const item = await makeEquipment(org, { unitCount: 1 });
    const first = { ...futureWindow(14, 2), startTime: '09:00', endTime: '17:00' };
    // Starts at the very instant the first hire ends.
    const second = {
      startDate: first.endDate,
      endDate: futureWindow(18, 0).startDate,
      startTime: '17:00',
      endTime: '17:00',
    };

    const a = await makeUser(org, { email: 'first@test.local' });
    const b = await makeUser(org, { email: 'second@test.local' });

    await expect(submit(a, item, first)).resolves.toBeTruthy();
    // Ranges are half-open — '[start, end)' — so an end at 17:00 and a start
    // at 17:00 touch without overlapping. With inclusive bounds this would be
    // rejected, and every same-day turnaround would be impossible.
    await expect(submit(b, item, second)).resolves.toBeTruthy();
  });

  it('still refuses a hire that starts one minute before the previous ends', async () => {
    const item = await makeEquipment(org, { unitCount: 1 });
    const first = { ...futureWindow(14, 2), startTime: '09:00', endTime: '17:00' };
    const overlapping = {
      startDate: first.endDate,
      endDate: futureWindow(18, 0).startDate,
      startTime: '16:59',
      endTime: '17:00',
    };

    const a = await makeUser(org, { email: 'overlap-a@test.local' });
    const b = await makeUser(org, { email: 'overlap-b@test.local' });

    await submit(a, item, first);
    await expect(submit(b, item, overlapping)).rejects.toThrow();
  });

  it('frees the unit again once the first booking is cancelled', async () => {
    const item = await makeEquipment(org, { unitCount: 1 });
    const window = futureWindow();
    const a = await makeUser(org, { email: 'holder@test.local' });
    const b = await makeUser(org, { email: 'waiter@test.local' });

    const { booking } = await submit(a, item, window);
    await expect(submit(b, item, window)).rejects.toThrow();

    // Release it the way the service does — a soft release, so the history of
    // what was held survives.
    await db
      .update(availabilityBlocks)
      .set({ isActive: false })
      .where(eq(availabilityBlocks.bookingId, booking.id));

    await expect(submit(b, item, window)).resolves.toBeTruthy();
  });

  it('respects the turnaround buffer between hires', async () => {
    // 48 hours of drying time after each hire.
    const item = await makeEquipment(org, { unitCount: 1, turnaroundHours: 48 });
    const first = futureWindow(14, 1);
    const a = await makeUser(org, { email: 'buffer-a@test.local' });
    const b = await makeUser(org, { email: 'buffer-b@test.local' });

    await submit(a, item, first);

    // Starting the next day falls inside the buffer, so it must be refused.
    const tooSoon = { startDate: first.endDate, endDate: futureWindow(16, 0).startDate };
    await expect(submit(b, item, tooSoon)).rejects.toThrow();

    // Three days later is clear.
    const later = futureWindow(19, 1);
    await expect(submit(b, item, later)).resolves.toBeTruthy();
  });
});
