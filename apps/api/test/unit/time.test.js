import { describe, it, expect } from 'vitest';
import { hireDays, isoDatesBetween, localDateTime, localParts, toRange } from '#src/lib/time.js';

const ADELAIDE = 'Australia/Adelaide';

describe('hireDays', () => {
  it('counts calendar days touched, not elapsed hours', () => {
    // Saturday 9am to Monday 10am is three days of hire, not 1.04.
    const start = localDateTime('2026-03-14', '09:00', ADELAIDE);
    const end = localDateTime('2026-03-16', '10:00', ADELAIDE);
    expect(hireDays(start, end, ADELAIDE)).toBe(3);
  });

  it('counts a same-day hire as one day', () => {
    const start = localDateTime('2026-03-14', '09:00', ADELAIDE);
    const end = localDateTime('2026-03-14', '17:00', ADELAIDE);
    expect(hireDays(start, end, ADELAIDE)).toBe(1);
  });

  /**
   * Adelaide leaves daylight saving on 5 April 2026, so this window contains a
   * 25-hour day: 49 hours elapsed over three calendar days.
   */
  it('is correct across the end of daylight saving', () => {
    const start = localDateTime('2026-04-04', '09:00', ADELAIDE);
    const end = localDateTime('2026-04-06', '09:00', ADELAIDE);
    expect(hireDays(start, end, ADELAIDE)).toBe(3);
  });

  /**
   * Adelaide enters daylight saving on 4 October 2026, so this window contains
   * a 23-hour day — and this is the case that actually breaks naive
   * arithmetic. Only 47 hours elapse, so dividing by 24 gives 2 days and
   * undercharges the customer by a full day, once a year, in one direction
   * only. Counting calendar days in the organisation's zone gives 3.
   */
  it('is correct across the start of daylight saving, where naive maths fails', () => {
    const start = localDateTime('2026-10-03', '09:00', ADELAIDE);
    const end = localDateTime('2026-10-05', '09:00', ADELAIDE);
    expect(hireDays(start, end, ADELAIDE)).toBe(3);

    // The bug this function exists to prevent.
    const naiveDays = Math.ceil((end - start) / 86_400_000);
    expect(naiveDays).toBe(2);
  });

  it('never returns less than one day', () => {
    const t = localDateTime('2026-03-14', '09:00', ADELAIDE);
    expect(hireDays(t, t, ADELAIDE)).toBe(1);
  });
});

describe('localDateTime and localParts', () => {
  it('interprets a wall-clock time in the organisation timezone', () => {
    // Adelaide is UTC+10:30 in March (daylight saving).
    const instant = localDateTime('2026-03-14', '09:00', ADELAIDE);
    expect(instant.toISOString()).toBe('2026-03-13T22:30:00.000Z');
  });

  it('handles the half-hour offset outside daylight saving', () => {
    // UTC+9:30 in June.
    const instant = localDateTime('2026-06-14', '09:00', ADELAIDE);
    expect(instant.toISOString()).toBe('2026-06-13T23:30:00.000Z');
  });

  it('maps Sunday to 0 to match JS getDay, not Luxon', () => {
    const sunday = localDateTime('2026-03-15', '10:00', ADELAIDE);
    expect(localParts(sunday, ADELAIDE).weekday).toBe(0);
    const saturday = localDateTime('2026-03-14', '10:00', ADELAIDE);
    expect(localParts(saturday, ADELAIDE).weekday).toBe(6);
  });

  it('rejects an impossible date', () => {
    expect(localDateTime('2026-02-31', '09:00', ADELAIDE)).toBeNull();
  });
});

describe('toRange', () => {
  it('produces a half-open range so back-to-back hires do not collide', () => {
    const range = toRange(new Date('2026-03-14T00:00:00Z'), new Date('2026-03-16T00:00:00Z'));
    expect(range).toBe('[2026-03-14T00:00:00.000Z,2026-03-16T00:00:00.000Z)');
    expect(range.endsWith(')')).toBe(true);
  });
});

describe('isoDatesBetween', () => {
  it('lists every local date the window touches', () => {
    const start = localDateTime('2026-03-14', '23:00', ADELAIDE);
    const end = localDateTime('2026-03-16', '01:00', ADELAIDE);
    expect(isoDatesBetween(start, end, ADELAIDE)).toEqual([
      '2026-03-14',
      '2026-03-15',
      '2026-03-16',
    ]);
  });
});
