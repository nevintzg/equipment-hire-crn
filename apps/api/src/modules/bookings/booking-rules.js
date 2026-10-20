import { hireDays, localParts } from '#src/lib/time.js';

/**
 * Per-item hire rules, checked before a booking is accepted.
 *
 * Pure, like pricing: these are the rules a customer will be told they broke,
 * so the messages matter as much as the logic and both are unit-tested.
 */

/**
 * @param {object} p
 * @param {Array<{equipment: object, quantity: number}>} p.items
 * @param {Date} p.startAt
 * @param {Date} p.endAt
 * @param {string} p.timezone
 * @param {Date} [p.at] "now", injectable for tests
 * @returns {{errors: Array<{equipmentId: string|null, message: string}>}}
 */
export function checkHireRules({ items, startAt, endAt, timezone, at = new Date() }) {
  const errors = [];
  const push = (equipmentId, message) => errors.push({ equipmentId, message });

  if (endAt <= startAt) {
    push(null, 'The return date must be after the collection date.');
    return { errors };
  }
  if (startAt < at) {
    push(null, 'The collection date is in the past.');
    return { errors };
  }

  const days = hireDays(startAt, endAt, timezone);
  const noticeDays = Math.floor((startAt.getTime() - at.getTime()) / 86_400_000);

  for (const { equipment: eq, quantity } of items) {
    if (eq.status !== 'PUBLISHED') {
      push(eq.id, `${eq.name} is not currently available to hire.`);
      continue;
    }

    const units = eq.bookingUnit === 'HOUR' ? Math.ceil((endAt - startAt) / 3_600_000) : days;
    const noun = eq.bookingUnit === 'HOUR' ? 'hour' : 'day';

    if (units < eq.minHireUnits) {
      push(
        eq.id,
        `${eq.name} has a minimum hire of ${eq.minHireUnits} ${noun}${eq.minHireUnits === 1 ? '' : 's'}.`,
      );
    }
    if (eq.maxHireUnits && units > eq.maxHireUnits) {
      push(
        eq.id,
        `${eq.name} can be hired for at most ${eq.maxHireUnits} ${noun}${eq.maxHireUnits === 1 ? '' : 's'}.`,
      );
    }
    if (noticeDays < eq.minNoticeDays) {
      push(
        eq.id,
        `${eq.name} needs at least ${eq.minNoticeDays} day${eq.minNoticeDays === 1 ? '' : 's'} notice. Please choose a later date.`,
      );
    }
    if (noticeDays > eq.maxAdvanceDays) {
      push(eq.id, `${eq.name} cannot be booked more than ${eq.maxAdvanceDays} days ahead.`);
    }
    if (eq.maxPerBooking && quantity > eq.maxPerBooking) {
      push(eq.id, `You can book at most ${eq.maxPerBooking} of ${eq.name} at a time.`);
    }
    if (quantity < 1) {
      push(eq.id, `Choose at least one ${eq.name}.`);
    }
  }

  return { errors };
}

/**
 * Whether a handover time falls inside one of the organisation's published
 * windows. A volunteer-run shed is open on Saturday mornings, not whenever a
 * date picker allows, so this is checked server-side rather than trusted from
 * the UI.
 *
 * @param {Date} at
 * @param {Array<{weekday: number, startTime: string, endTime: string, kind: string}>} slots
 * @param {'PICKUP'|'RETURN'} kind
 * @param {string} timezone
 */
export function withinSlots(at, slots, kind, timezone) {
  if (!slots.length) return true; // no windows configured: anything goes
  const { weekday, time } = localParts(at, timezone);
  return slots.some(
    (s) =>
      s.weekday === weekday &&
      (s.kind === 'BOTH' || s.kind === kind) &&
      time >= s.startTime &&
      time <= s.endTime,
  );
}

/**
 * Dates the organisation is closed, from settings. Blocks collection and
 * return on those days, but not the hire spanning them — a marquee can stay up
 * over a public holiday.
 *
 * @param {Date} at
 * @param {string[]} closedDates yyyy-MM-dd
 * @param {string} timezone
 */
export function isClosedDate(at, closedDates, timezone) {
  if (!closedDates?.length) return false;
  return closedDates.includes(localParts(at, timezone).isoDate);
}
