import { DateTime, Interval } from 'luxon';

/**
 * Time handling.
 *
 * The rule in this codebase: instants are UTC `timestamptz` in the database
 * and `Date` objects in JS. Anything a human reasons about — "how many days
 * is this hire?", "which Saturday slot?" — is computed in the organisation's
 * timezone, because Adelaide shifts between UTC+9:30 and UTC+10:30 and naive
 * arithmetic silently produces off-by-one day counts twice a year.
 *
 * Adelaide is also a half-hour offset, which breaks the common shortcut of
 * rounding to whole-hour offsets.
 */

/**
 * A Postgres half-open tstzrange literal: '["2026-01-01T00:00:00Z",...)'.
 * Half-open means a return at 10:00 and the next pickup at 10:00 do not
 * overlap, which is the behaviour the exclusion constraint relies on.
 *
 * @param {Date} start
 * @param {Date} end
 */
export const toRange = (start, end) => `[${start.toISOString()},${end.toISOString()})`;

/**
 * Parse a Postgres range literal back into Dates.
 * @param {string} literal
 */
export function fromRange(literal) {
  const m = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(String(literal).trim());
  if (!m) return null;
  return { start: new Date(m[1]), end: new Date(m[2]) };
}

export const addHours = (date, hours) => new Date(date.getTime() + hours * 3_600_000);
export const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
export const hoursBetween = (a, b) => (b.getTime() - a.getTime()) / 3_600_000;

/**
 * Chargeable days for a hire.
 *
 * Counts distinct calendar days touched in the organisation's timezone, which
 * is what a customer expects: picking up Saturday morning and returning Sunday
 * afternoon is two days, not "1.2 days". Always at least 1.
 *
 * @param {Date} start
 * @param {Date} end
 * @param {string} timezone IANA zone
 */
export function hireDays(start, end, timezone) {
  const from = DateTime.fromJSDate(start, { zone: timezone }).startOf('day');
  const to = DateTime.fromJSDate(end, { zone: timezone }).startOf('day');
  return Math.max(1, Math.round(to.diff(from, 'days').days) + 1);
}

/** Whole hours, rounded up — for HOUR-unit equipment. */
export function hireHours(start, end) {
  return Math.max(1, Math.ceil(hoursBetween(start, end)));
}

/**
 * Local calendar parts, for slot matching and email formatting.
 * @param {Date} date
 * @param {string} timezone
 */
export function localParts(date, timezone) {
  const dt = DateTime.fromJSDate(date, { zone: timezone });
  return {
    weekday: dt.weekday === 7 ? 0 : dt.weekday, // Luxon: Mon=1..Sun=7 → JS: Sun=0
    time: dt.toFormat('HH:mm'),
    isoDate: dt.toISODate(),
    label: dt.toFormat('cccc d LLLL yyyy'),
    timeLabel: dt.toFormat('h:mm a'),
  };
}

/**
 * The UTC instants bounding a local calendar day. Used to turn "2026-03-14"
 * from a date picker into a range the database can compare.
 *
 * @param {string} isoDate yyyy-MM-dd
 * @param {string} timezone
 * @param {string} [startTime] HH:mm, defaults to midnight
 * @param {string} [endTime]   HH:mm on the *end* date
 */
export function localDayBounds(isoDate, timezone, startTime = '00:00', endTime = '23:59') {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const base = DateTime.fromISO(isoDate, { zone: timezone });
  return {
    start: base.set({ hour: sh, minute: sm, second: 0, millisecond: 0 }).toJSDate(),
    end: base.set({ hour: eh, minute: em, second: 59, millisecond: 999 }).toJSDate(),
  };
}

/**
 * Combine a local date and time into a UTC instant.
 * @param {string} isoDate yyyy-MM-dd
 * @param {string} time HH:mm
 * @param {string} timezone
 */
export function localDateTime(isoDate, time, timezone) {
  const [h, m] = time.split(':').map(Number);
  const dt = DateTime.fromISO(isoDate, { zone: timezone }).set({
    hour: h,
    minute: m,
    second: 0,
    millisecond: 0,
  });
  if (!dt.isValid) return null;
  return dt.toJSDate();
}

/**
 * Every local date a range touches — the availability calendar's x-axis.
 * @param {Date} start
 * @param {Date} end
 * @param {string} timezone
 * @returns {string[]} yyyy-MM-dd
 */
export function isoDatesBetween(start, end, timezone) {
  const from = DateTime.fromJSDate(start, { zone: timezone }).startOf('day');
  const to = DateTime.fromJSDate(end, { zone: timezone }).endOf('day');
  return Interval.fromDateTimes(from, to)
    .splitBy({ days: 1 })
    .map((i) => i.start.toISODate());
}

/** Now, as a Date. Centralised so tests can fake it in one place. */
export const now = () => new Date();
