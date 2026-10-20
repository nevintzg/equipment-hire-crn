import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { availabilityBlocks, equipment, equipmentUnits } from '#src/db/schema/index.js';
import { toRange, isoDatesBetween, addHours } from '#src/lib/time.js';
import { conflict } from '#src/lib/errors.js';

/**
 * Availability.
 *
 * Two models, one table:
 *
 *   SERIALIZED — each unit is tracked. A unit is free for a period when no
 *   active block overlaps it. The GiST exclusion constraint in
 *   0002_integrity.sql means that even if this code's check is wrong or races,
 *   the INSERT itself fails. The check exists to give a good error message;
 *   the constraint is what guarantees correctness.
 *
 *   BULK — a quantity pool. There is nothing to exclude, so correctness comes
 *   from taking a row lock on the equipment row before summing existing
 *   blocks. Two concurrent transactions therefore queue behind each other
 *   instead of both reading "40 available" and both booking 30.
 *
 * Statuses that reserve stock are listed once, below. Getting this list wrong
 * is the difference between holding stock for an unpaid request (bad for the
 * organisation) and releasing stock that is out on hire (much worse).
 */

/** Booking statuses that hold stock. */
export const RESERVING_STATUSES = ['APPROVED', 'CONFIRMED', 'PICKED_UP', 'RETURNED'];

/**
 * Take a row lock on the equipment row.
 *
 * This is the serialisation point for bulk availability. It must be called
 * inside a transaction, before reading quantities, and the same lock must be
 * taken by every writer — otherwise one path reads stale totals.
 *
 * @param {import('#src/db/client.js').Tx} tx
 * @param {string[]} equipmentIds
 */
export async function lockEquipment(tx, equipmentIds) {
  if (!equipmentIds.length) return [];
  // Ordered by id so two transactions locking overlapping sets always take
  // them in the same sequence — which is what prevents a deadlock.
  const ids = [...new Set(equipmentIds)].sort();
  return tx
    .select({ id: equipment.id })
    .from(equipment)
    .where(inArray(equipment.id, ids))
    .orderBy(equipment.id)
    .for('update');
}

/**
 * Period actually held for a hire, including the turnaround buffer.
 *
 * A marquee returned at 5pm Sunday cannot go out again at 9am Monday if it
 * needs drying. The buffer is added to the end of the held period, not shown
 * to the customer as part of their hire.
 */
export const heldPeriod = (startAt, endAt, turnaroundHours = 0) => ({
  start: startAt,
  end: turnaroundHours ? addHours(endAt, turnaroundHours) : endAt,
});

/**
 * Unit ids of a serialized item that are free for the whole period.
 *
 * @param {import('#src/db/client.js').Tx} tx
 * @param {object} p
 * @param {string} p.equipmentId
 * @param {Date} p.start
 * @param {Date} p.end
 * @param {string} [p.excludeBookingId] ignore this booking's own blocks (edits)
 */
export async function freeUnitIds(tx, { equipmentId, start, end, excludeBookingId }) {
  const range = toRange(start, end);

  const rows = await tx
    .select({ id: equipmentUnits.id, assetTag: equipmentUnits.assetTag })
    .from(equipmentUnits)
    .where(
      and(
        eq(equipmentUnits.equipmentId, equipmentId),
        // Only units that are physically able to go out.
        eq(equipmentUnits.status, 'AVAILABLE'),
        // NOT EXISTS is the right shape here: Postgres can stop at the first
        // overlapping block instead of materialising them all.
        sql`NOT EXISTS (
          SELECT 1 FROM ${availabilityBlocks} ab
          WHERE ab.unit_id = ${equipmentUnits.id}
            AND ab.is_active
            AND ab.period && ${range}::tstzrange
            ${excludeBookingId ? sql`AND (ab.booking_id IS NULL OR ab.booking_id <> ${excludeBookingId})` : sql``}
        )`,
      ),
    )
    .orderBy(equipmentUnits.assetTag);

  return rows;
}

/**
 * How many of a BULK item are free for the period.
 *
 * Call lockEquipment() first in the same transaction.
 *
 * @param {import('#src/db/client.js').Tx} tx
 */
export async function availableQuantity(tx, { equipmentId, start, end, excludeBookingId }) {
  const range = toRange(start, end);

  const [item] = await tx
    .select({ bulkQuantity: equipment.bulkQuantity })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);
  const capacity = item?.bulkQuantity ?? 0;

  const [used] = await tx
    .select({ total: sql`coalesce(sum(${availabilityBlocks.quantity}), 0)::int` })
    .from(availabilityBlocks)
    .where(
      and(
        eq(availabilityBlocks.equipmentId, equipmentId),
        isNull(availabilityBlocks.unitId),
        eq(availabilityBlocks.isActive, true),
        sql`${availabilityBlocks.period} && ${range}::tstzrange`,
        excludeBookingId
          ? or(
              isNull(availabilityBlocks.bookingId),
              ne(availabilityBlocks.bookingId, excludeBookingId),
            )
          : undefined,
      ),
    );

  return Math.max(0, capacity - (used?.total ?? 0));
}

/**
 * Reserve stock for a booking line and return the blocks created.
 *
 * For serialized items this both picks the units and writes their blocks; if
 * the exclusion constraint rejects an insert (someone else got there between
 * the read and the write), the whole transaction fails and the caller reports
 * a 409 — which is exactly the behaviour we want.
 *
 * @param {import('#src/db/client.js').Tx} tx
 */
export async function allocateUnits(
  tx,
  { organisationId, bookingId, bookingItemId, equipmentItem, quantity, start, end, createdBy },
) {
  const period = heldPeriod(start, end, equipmentItem.turnaroundHours);
  const range = toRange(period.start, period.end);

  if (equipmentItem.inventoryMode === 'BULK') {
    const available = await availableQuantity(tx, {
      equipmentId: equipmentItem.id,
      start: period.start,
      end: period.end,
      excludeBookingId: bookingId,
    });
    if (available < quantity) {
      throw conflict(
        `Only ${available} × ${equipmentItem.name} ${available === 1 ? 'is' : 'are'} available for those dates.`,
        { equipmentId: equipmentItem.id, requested: quantity, available },
      );
    }
    const [block] = await tx
      .insert(availabilityBlocks)
      .values({
        organisationId,
        equipmentId: equipmentItem.id,
        unitId: null,
        quantity,
        period: range,
        reason: 'BOOKING',
        bookingId,
        createdBy: createdBy ?? null,
      })
      .returning({ id: availabilityBlocks.id });
    return { blocks: [block.id], allocations: [] };
  }

  const free = await freeUnitIds(tx, {
    equipmentId: equipmentItem.id,
    start: period.start,
    end: period.end,
    excludeBookingId: bookingId,
  });

  if (free.length < quantity) {
    throw conflict(
      `Only ${free.length} × ${equipmentItem.name} ${free.length === 1 ? 'is' : 'are'} available for those dates.`,
      { equipmentId: equipmentItem.id, requested: quantity, available: free.length },
    );
  }

  const chosen = free.slice(0, quantity);
  const blocks = [];
  const allocations = [];

  for (const unit of chosen) {
    try {
      const [block] = await tx
        .insert(availabilityBlocks)
        .values({
          organisationId,
          equipmentId: equipmentItem.id,
          unitId: unit.id,
          quantity: 1,
          period: range,
          reason: 'BOOKING',
          bookingId,
          createdBy: createdBy ?? null,
        })
        .returning({ id: availabilityBlocks.id });
      blocks.push(block.id);
      allocations.push({ unitId: unit.id, bookingItemId, availabilityBlockId: block.id });
    } catch (err) {
      // 23P01 is the exclusion constraint firing: between the read above and
      // this insert, another transaction committed a booking for this unit.
      // The read lost the race; the constraint caught it.
      //
      // Translated here rather than left to the HTTP error handler, so the
      // guarantee holds for every caller — a scheduled job or a test calling
      // the service directly gets the same domain error as a web request.
      if (err?.code === '23P01') {
        throw conflict(`${equipmentItem.name} was just booked by someone else for those dates.`, {
          equipmentId: equipmentItem.id,
          unitId: unit.id,
          raced: true,
        });
      }
      throw err;
    }
  }

  return { blocks, allocations };
}

/** Release every block a booking holds. Used on cancel, reject and expiry. */
export async function releaseBookingBlocks(tx, bookingId, note) {
  const released = await tx
    .update(availabilityBlocks)
    .set({ isActive: false, note: note ?? null })
    .where(and(eq(availabilityBlocks.bookingId, bookingId), eq(availabilityBlocks.isActive, true)))
    .returning({ id: availabilityBlocks.id });
  return released.length;
}

/** Total stock of an item, regardless of dates. */
export async function totalCapacity(tx, equipmentItem) {
  if (equipmentItem.inventoryMode === 'BULK') return equipmentItem.bulkQuantity ?? 0;
  const [row] = await tx
    .select({ count: sql`count(*)::int` })
    .from(equipmentUnits)
    .where(
      and(eq(equipmentUnits.equipmentId, equipmentItem.id), eq(equipmentUnits.status, 'AVAILABLE')),
    );
  return row?.count ?? 0;
}

/**
 * Day-by-day availability for the calendar on an equipment page.
 *
 * One query for the whole window rather than one per day: on a cold free-tier
 * database, thirty sequential round trips is a visibly slow calendar.
 *
 * @param {import('#src/db/client.js').Tx} tx
 * @param {object} p
 * @param {object} p.equipmentItem
 * @param {Date} p.from
 * @param {Date} p.to
 * @param {string} p.timezone
 */
export async function dailyAvailability(tx, { equipmentItem, from, to, timezone }) {
  const capacity = await totalCapacity(tx, equipmentItem);
  const dates = isoDatesBetween(from, to, timezone);

  // Postgres does the bucketing: generate the day series, then count how much
  // stock each day's range collides with.
  const rows = await tx.execute(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${from.toISOString()}::timestamptz AT TIME ZONE ${timezone}),
        date_trunc('day', ${to.toISOString()}::timestamptz AT TIME ZONE ${timezone}),
        interval '1 day'
      ) AS local_day
    ),
    spans AS (
      SELECT
        to_char(local_day, 'YYYY-MM-DD') AS iso_date,
        tstzrange(
          (local_day AT TIME ZONE ${timezone}),
          (local_day + interval '1 day') AT TIME ZONE ${timezone},
          '[)'
        ) AS day_range
      FROM days
    )
    SELECT
      s.iso_date,
      COALESCE(SUM(ab.quantity) FILTER (WHERE ab.reason = 'BOOKING'), 0)::int AS booked,
      COALESCE(SUM(ab.quantity) FILTER (WHERE ab.reason <> 'BOOKING'), 0)::int AS blocked
    FROM spans s
    LEFT JOIN availability_blocks ab
      ON ab.equipment_id = ${equipmentItem.id}
     AND ab.is_active
     AND ab.period && s.day_range
    GROUP BY s.iso_date
    ORDER BY s.iso_date
  `);

  const byDate = new Map(
    (rows.rows ?? rows).map((r) => [r.iso_date, { booked: r.booked, blocked: r.blocked }]),
  );

  return dates.map((isoDate) => {
    const used = byDate.get(isoDate) ?? { booked: 0, blocked: 0 };
    const available = Math.max(0, capacity - used.booked - used.blocked);
    return {
      date: isoDate,
      capacity,
      booked: used.booked,
      blocked: used.blocked,
      available,
      status: available === 0 ? 'FULL' : available < capacity ? 'PARTIAL' : 'FREE',
    };
  });
}
