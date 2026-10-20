import { eq, and, sql } from 'drizzle-orm';
import { bookingStatusHistory, bookings } from '#src/db/schema/index.js';
import { releaseBookingBlocks } from '#src/modules/availability/availability.service.js';
import { conflict } from '#src/lib/errors.js';
import { now } from '#src/lib/time.js';

/**
 * The booking state machine.
 *
 * Every status change in the system goes through transition(). Nothing calls
 * `UPDATE bookings SET status = …` directly, because three things must happen
 * together or not at all:
 *
 *   1. the transition must be legal,
 *   2. history must be appended (the client asked for an audit trail),
 *   3. stock must be released when the booking stops reserving it.
 *
 *     PENDING_REVIEW ──approve──► APPROVED ──pay──► CONFIRMED
 *           │                        │                  │
 *           ├──reject──► REJECTED    ├─timeout─► EXPIRED │
 *           └──cancel──► CANCELLED   └──cancel─► CANCELLED
 *                                                       │
 *                                    PICKED_UP ◄──hand over
 *                                        │
 *                                    RETURNED ──inspect──► COMPLETED
 *
 * "Overdue" is not here: an overdue booking is still PICKED_UP, just late.
 * Making it a status would lose the fact that the gear is out.
 */

/** Legal transitions. Anything not listed is rejected. */
export const TRANSITIONS = {
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CONFIRMED', 'EXPIRED', 'CANCELLED', 'REJECTED'],
  CONFIRMED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['RETURNED'],
  RETURNED: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/** Statuses after which the booking no longer holds stock. */
const RELEASES_STOCK = new Set(['REJECTED', 'EXPIRED', 'CANCELLED', 'COMPLETED']);

/** Statuses a customer may still act on. */
export const CUSTOMER_CANCELLABLE = new Set(['PENDING_REVIEW', 'APPROVED', 'CONFIRMED']);

export const isTerminal = (status) => TRANSITIONS[status]?.length === 0;
export const canTransition = (from, to) => Boolean(TRANSITIONS[from]?.includes(to));

/**
 * Apply a status change.
 *
 * Optimistic concurrency: the UPDATE asserts both the status and the version
 * that were read. If another request changed the booking in between, zero rows
 * match and this throws — so two staff members clicking "Approve" at the same
 * moment cannot both succeed, and the second gets told to reload rather than
 * silently overwriting the first.
 *
 * @param {import('#src/db/client.js').Tx} tx
 * @param {object} p
 * @param {object} p.booking   the row as read (needs id, status, version)
 * @param {string} p.to        target status
 * @param {string} [p.actorUserId] null for system actions (cron, webhook)
 * @param {'USER'|'SYSTEM'|'CUSTOMER'} [p.actorKind]
 * @param {string} [p.reason]
 * @param {Record<string, unknown>} [p.meta]
 * @param {Record<string, unknown>} [p.set] extra columns to write
 */
export async function transition(
  tx,
  { booking, to, actorUserId = null, actorKind = 'USER', reason, meta, set = {} },
) {
  const from = booking.status;

  if (!canTransition(from, to)) {
    throw conflict(`A booking that is ${humanStatus(from)} cannot be marked ${humanStatus(to)}.`, {
      from,
      to,
      allowed: TRANSITIONS[from] ?? [],
    });
  }

  const updated = await tx
    .update(bookings)
    .set({
      status: to,
      version: sql`${bookings.version} + 1`,
      ...set,
    })
    .where(
      and(
        eq(bookings.id, booking.id),
        eq(bookings.status, from),
        eq(bookings.version, booking.version),
      ),
    )
    .returning();

  if (!updated.length) {
    throw conflict('This booking was changed by someone else. Please reload and try again.', {
      bookingId: booking.id,
    });
  }

  await tx.insert(bookingStatusHistory).values({
    organisationId: booking.organisationId,
    bookingId: booking.id,
    fromStatus: from,
    toStatus: to,
    actorUserId,
    actorKind,
    reason: reason ?? null,
    meta: meta ?? {},
  });

  // Free the stock as part of the same transaction, so a booking can never be
  // cancelled while still holding a marquee.
  if (RELEASES_STOCK.has(to)) {
    await releaseBookingBlocks(tx, booking.id, `Released on ${to}`);
  }

  return updated[0];
}

/**
 * Status as the customer should see it, accounting for time.
 *
 * Two things are computed rather than stored:
 *
 *   - an APPROVED booking past its payment deadline is really EXPIRED;
 *   - a PICKED_UP booking past its return date is OVERDUE.
 *
 * Both are derived at read time so the UI is correct the instant a deadline
 * passes, without a worker process polling for it. The hourly tick then
 * persists the EXPIRED transition so the stock is actually released.
 *
 * @param {{status: string, paymentDueAt: Date|null, endAt: Date}} booking
 * @param {Date} [at]
 */
export function effectiveStatus(booking, at = now()) {
  if (booking.status === 'APPROVED' && booking.paymentDueAt && booking.paymentDueAt < at) {
    return 'EXPIRED';
  }
  if (booking.status === 'PICKED_UP' && booking.endAt < at) {
    return 'OVERDUE';
  }
  return booking.status;
}

const LABELS = {
  PENDING_REVIEW: 'awaiting review',
  APPROVED: 'approved',
  CONFIRMED: 'confirmed',
  PICKED_UP: 'collected',
  RETURNED: 'returned',
  COMPLETED: 'completed',
  REJECTED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  OVERDUE: 'overdue',
};

export const humanStatus = (status) => LABELS[status] ?? String(status).toLowerCase();
