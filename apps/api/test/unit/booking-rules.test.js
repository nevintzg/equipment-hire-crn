import { describe, it, expect } from 'vitest';
import { checkHireRules, isClosedDate, withinSlots } from '#src/modules/bookings/booking-rules.js';
import { localDateTime } from '#src/lib/time.js';

const ADELAIDE = 'Australia/Adelaide';
const now = new Date('2026-03-01T00:00:00Z');

const item = (overrides = {}) => ({
  equipment: {
    id: 'eq1',
    name: 'Marquee',
    status: 'PUBLISHED',
    bookingUnit: 'DAY',
    minHireUnits: 1,
    maxHireUnits: 14,
    minNoticeDays: 2,
    maxAdvanceDays: 365,
    maxPerBooking: 2,
    ...overrides,
  },
  quantity: overrides.quantity ?? 1,
});

const window = (startIso, endIso) => ({
  startAt: localDateTime(startIso, '09:00', ADELAIDE),
  endAt: localDateTime(endIso, '17:00', ADELAIDE),
});

describe('checkHireRules', () => {
  it('accepts a valid booking', () => {
    const { errors } = checkHireRules({
      items: [item()],
      ...window('2026-03-14', '2026-03-16'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors).toEqual([]);
  });

  it('rejects a return before the collection', () => {
    const { errors } = checkHireRules({
      items: [item()],
      ...window('2026-03-16', '2026-03-14'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/return date must be after/i);
  });

  it('rejects a start date in the past', () => {
    const { errors } = checkHireRules({
      items: [item()],
      ...window('2026-02-01', '2026-02-03'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/in the past/i);
  });

  it('enforces minimum notice, and says how much is needed', () => {
    const { errors } = checkHireRules({
      items: [item({ minNoticeDays: 5 })],
      ...window('2026-03-03', '2026-03-04'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/at least 5 days notice/i);
  });

  it('enforces the maximum hire length', () => {
    const { errors } = checkHireRules({
      items: [item({ maxHireUnits: 3 })],
      ...window('2026-03-14', '2026-03-25'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/at most 3 days/i);
  });

  it('enforces the minimum hire length', () => {
    const { errors } = checkHireRules({
      items: [item({ minHireUnits: 3 })],
      ...window('2026-03-14', '2026-03-14'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/minimum hire of 3 days/i);
  });

  it('enforces the per-booking quantity cap', () => {
    const { errors } = checkHireRules({
      items: [{ ...item({ maxPerBooking: 2 }), quantity: 3 }],
      ...window('2026-03-14', '2026-03-16'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/at most 2 of Marquee/i);
  });

  it('refuses an unpublished item', () => {
    const { errors } = checkHireRules({
      items: [item({ status: 'DRAFT' })],
      ...window('2026-03-14', '2026-03-16'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/not currently available/i);
  });

  it('reports every broken rule at once, not just the first', () => {
    const { errors } = checkHireRules({
      items: [
        item({ minNoticeDays: 30 }),
        { ...item({ id: 'eq2', name: 'PA', maxHireUnits: 1 }), quantity: 1 },
      ],
      ...window('2026-03-05', '2026-03-09'),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors.length).toBeGreaterThan(1);
  });

  it('uses hours for an HOUR-unit item', () => {
    const { errors } = checkHireRules({
      items: [item({ bookingUnit: 'HOUR', minHireUnits: 4, minNoticeDays: 0 })],
      startAt: localDateTime('2026-03-14', '09:00', ADELAIDE),
      endAt: localDateTime('2026-03-14', '11:00', ADELAIDE),
      timezone: ADELAIDE,
      at: now,
    });
    expect(errors[0].message).toMatch(/minimum hire of 4 hours/i);
  });
});

describe('withinSlots', () => {
  // Saturday 09:00–12:00, both pickup and return.
  const slots = [{ weekday: 6, startTime: '09:00', endTime: '12:00', kind: 'BOTH' }];

  it('accepts a handover inside the window', () => {
    const at = localDateTime('2026-03-14', '10:00', ADELAIDE);
    expect(withinSlots(at, slots, 'PICKUP', ADELAIDE)).toBe(true);
  });

  it('rejects a handover outside the window', () => {
    const at = localDateTime('2026-03-14', '15:00', ADELAIDE);
    expect(withinSlots(at, slots, 'PICKUP', ADELAIDE)).toBe(false);
  });

  it('rejects the right time on the wrong day', () => {
    const at = localDateTime('2026-03-15', '10:00', ADELAIDE); // Sunday
    expect(withinSlots(at, slots, 'PICKUP', ADELAIDE)).toBe(false);
  });

  it('respects a pickup-only window', () => {
    const pickupOnly = [{ weekday: 6, startTime: '09:00', endTime: '12:00', kind: 'PICKUP' }];
    const at = localDateTime('2026-03-14', '10:00', ADELAIDE);
    expect(withinSlots(at, pickupOnly, 'PICKUP', ADELAIDE)).toBe(true);
    expect(withinSlots(at, pickupOnly, 'RETURN', ADELAIDE)).toBe(false);
  });

  it('allows anything when the organisation publishes no windows', () => {
    const at = localDateTime('2026-03-15', '03:00', ADELAIDE);
    expect(withinSlots(at, [], 'PICKUP', ADELAIDE)).toBe(true);
  });
});

describe('isClosedDate', () => {
  it('blocks a configured closure date', () => {
    const at = localDateTime('2026-12-25', '10:00', ADELAIDE);
    expect(isClosedDate(at, ['2026-12-25'], ADELAIDE)).toBe(true);
  });

  it('compares in the organisation timezone, not UTC', () => {
    // 09:00 on 25 Dec in Adelaide is still 24 Dec in UTC.
    const at = localDateTime('2026-12-25', '09:00', ADELAIDE);
    expect(at.toISOString().slice(0, 10)).toBe('2026-12-24');
    expect(isClosedDate(at, ['2026-12-25'], ADELAIDE)).toBe(true);
  });

  it('allows an ordinary day', () => {
    const at = localDateTime('2026-12-20', '10:00', ADELAIDE);
    expect(isClosedDate(at, ['2026-12-25'], ADELAIDE)).toBe(false);
  });
});
