import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#src/db/client.js';
import {
  availabilityBlocks,
  bondDeductions,
  bookingAllocations,
  bookings,
  conditionLogs,
  equipmentUnits,
  inspectionItems,
  inspections,
  users,
} from '#src/db/schema/index.js';
import { authenticate, requirePermission } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { auditAction } from '#src/modules/audit/audit.service.js';
import {
  approveBookingSchema,
  handoverSchema,
  inspectionSchema,
  listBookingsQuerySchema,
  reallocateSchema,
  rejectBookingSchema,
} from './bookings.schemas.js';
import * as service from './bookings.service.js';
import { transition } from './booking-state.js';
import { requestRefund } from '#src/modules/payments/payments.service.js';
import { getSettings } from '#src/modules/settings/settings.service.js';
import { getAppUrl } from '#src/modules/site/site.service.js';
import { dispatchOutboxSoon, enqueueEmail } from '#src/modules/notifications/outbox.service.js';
import { conflict, notFound } from '#src/lib/errors.js';
import { formatMoney } from '#src/lib/format.js';
import { hireDays, now } from '#src/lib/time.js';

/** Staff booking management. */
export function createAdminBookingsRouter() {
  const router = Router();
  router.use(authenticate('admin'));

  router.get(
    '/',
    requirePermission('booking.view'),
    validate({ query: listBookingsQuerySchema }),
    async (req, res) => {
      res.json(await service.listBookings({ org: req.org, query: req.valid.query }));
    },
  );

  router.get('/:id', requirePermission('booking.view'), async (req, res) => {
    res.json({ data: await service.getBooking({ org: req.org, bookingId: req.params.id }) });
  });

  router.post(
    '/:id/approve',
    requirePermission('booking.approve'),
    validate({ body: approveBookingSchema }),
    auditAction('booking.approve', 'booking'),
    async (req, res) => {
      const booking = await service.approveBooking({
        org: req.org,
        bookingId: req.params.id,
        actor: req.auth,
        input: req.valid.body,
      });
      res.json({ data: booking });
    },
  );

  router.post(
    '/:id/reject',
    requirePermission('booking.approve'),
    validate({ body: rejectBookingSchema }),
    auditAction('booking.reject', 'booking'),
    async (req, res) => {
      const booking = await service.rejectBooking({
        org: req.org,
        bookingId: req.params.id,
        actor: req.auth,
        reason: req.valid.body.reason,
      });
      res.json({ data: booking });
    },
  );

  router.post(
    '/:id/cancel',
    requirePermission('booking.cancel'),
    validate({
      body: z.object({
        reason: z.string().trim().max(500).optional(),
        refundCents: z.number().int().min(0).optional(),
      }),
    }),
    auditAction('booking.cancel', 'booking'),
    async (req, res) => {
      const result = await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.id, req.params.id), eq(bookings.organisationId, req.org.id)))
          .limit(1);
        if (!booking) throw notFound('That booking could not be found.');

        const updated = await transition(tx, {
          booking,
          to: 'CANCELLED',
          actorUserId: req.auth.userId,
          reason: req.valid.body.reason ?? 'Cancelled by staff',
          set: {
            cancelledAt: now(),
            cancelledBy: req.auth.userId,
            cancellationReason: req.valid.body.reason ?? null,
          },
        });

        const [customer] = await tx
          .select()
          .from(users)
          .where(eq(users.id, booking.userId))
          .limit(1);
        const webUrl = await getAppUrl(req.org, 'web', tx);
        await enqueueEmail(tx, {
          organisationId: req.org.id,
          templateCode: 'booking.cancelled',
          toEmail: customer.email,
          toName: customer.firstName,
          userId: customer.id,
          bookingId: booking.id,
          variables: {
            siteUrl: webUrl,
            customer: { firstName: customer.firstName },
            booking: {
              reference: booking.reference,
              url: `${webUrl}/account/bookings/${booking.reference}`,
            },
            reason: req.valid.body.reason ?? '',
            refundLabel: req.valid.body.refundCents
              ? formatMoney(req.valid.body.refundCents, req.org.currency)
              : '',
          },
        });

        return updated;
      });

      // Staff-decided refund amount, issued outside the transaction.
      if (req.valid.body.refundCents) {
        await requestRefund({
          org: req.org,
          bookingId: req.params.id,
          amountCents: req.valid.body.refundCents,
          reasonCode: 'CANCELLATION',
          reasonNote: req.valid.body.reason,
          actor: req.auth,
        });
      }

      dispatchOutboxSoon();
      res.json({ data: result });
    },
  );

  /** Hand the equipment over. */
  router.post(
    '/:id/pickup',
    requirePermission('booking.handover'),
    validate({ body: handoverSchema }),
    auditAction('booking.pickup', 'booking'),
    async (req, res) => {
      const result = await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.id, req.params.id), eq(bookings.organisationId, req.org.id)))
          .limit(1);
        if (!booking) throw notFound('That booking could not be found.');

        const updated = await transition(tx, {
          booking,
          to: 'PICKED_UP',
          actorUserId: req.auth.userId,
          reason: 'Collected by customer',
          set: {
            pickedUpAt: now(),
            pickedUpBy: req.auth.userId,
            staffNotes: req.valid.body.notes ?? booking.staffNotes,
          },
        });

        // Units are physically out; mark them so, and record their condition
        // now so a damage claim later has a documented baseline.
        const allocations = await tx
          .select({ unitId: bookingAllocations.unitId })
          .from(bookingAllocations)
          .where(eq(bookingAllocations.bookingId, booking.id));
        for (const a of allocations) {
          await tx
            .update(equipmentUnits)
            .set({ status: 'ON_HIRE' })
            .where(eq(equipmentUnits.id, a.unitId));
        }

        for (const c of req.valid.body.conditions) {
          await tx.insert(conditionLogs).values({
            organisationId: req.org.id,
            equipmentId:
              (
                await tx
                  .select({ equipmentId: equipmentUnits.equipmentId })
                  .from(equipmentUnits)
                  .where(eq(equipmentUnits.id, c.unitId ?? ''))
                  .limit(1)
              )[0]?.equipmentId ?? null,
            unitId: c.unitId ?? null,
            bookingId: booking.id,
            context: 'PICKUP',
            condition: c.condition,
            notes: c.notes ?? null,
            photoFileId: c.photoFileId ?? null,
            recordedBy: req.auth.userId,
          });
        }

        return updated;
      });
      res.json({ data: result });
    },
  );

  /** Take the equipment back. Does not settle the bond — that needs an inspection. */
  router.post(
    '/:id/return',
    requirePermission('booking.handover'),
    validate({ body: handoverSchema }),
    auditAction('booking.return', 'booking'),
    async (req, res) => {
      const result = await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.id, req.params.id), eq(bookings.organisationId, req.org.id)))
          .limit(1);
        if (!booking) throw notFound('That booking could not be found.');

        // Late fee, if the organisation charges one.
        const settings = await getSettings(req.org.id, tx);
        const perDay = settings['booking.lateFeePerDayCents'] ?? 0;
        const daysLate =
          booking.endAt < now() ? hireDays(booking.endAt, now(), req.org.timezone) - 1 : 0;
        const lateFeeCents = perDay * Math.max(0, daysLate);

        const updated = await transition(tx, {
          booking,
          to: 'RETURNED',
          actorUserId: req.auth.userId,
          reason: daysLate > 0 ? `Returned ${daysLate} day(s) late` : 'Returned on time',
          set: {
            returnedAt: now(),
            returnedTo: req.auth.userId,
            lateFeeCents,
          },
        });

        const allocations = await tx
          .select({ unitId: bookingAllocations.unitId })
          .from(bookingAllocations)
          .where(eq(bookingAllocations.bookingId, booking.id));
        for (const a of allocations) {
          await tx
            .update(equipmentUnits)
            .set({ status: 'AVAILABLE' })
            .where(eq(equipmentUnits.id, a.unitId));
        }

        const [customer] = await tx
          .select()
          .from(users)
          .where(eq(users.id, booking.userId))
          .limit(1);
        const webUrl = await getAppUrl(req.org, 'web', tx);
        await enqueueEmail(tx, {
          organisationId: req.org.id,
          templateCode: 'booking.returned',
          toEmail: customer.email,
          toName: customer.firstName,
          userId: customer.id,
          bookingId: booking.id,
          variables: {
            siteUrl: webUrl,
            customer: { firstName: customer.firstName },
            booking: {
              reference: booking.reference,
              bondTotal: booking.bondTotalCents
                ? formatMoney(booking.bondTotalCents, req.org.currency)
                : '',
              url: `${webUrl}/account/bookings/${booking.reference}`,
            },
          },
        });

        return { booking: updated, lateFeeCents, daysLate };
      });

      dispatchOutboxSoon();
      res.json({ data: result });
    },
  );

  /**
   * Return inspection.
   *
   * This both completes the booking and decides the bond. Deductions are
   * itemised rows rather than one number, because a customer who loses part of
   * their bond is entitled to know exactly why.
   */
  router.post(
    '/:id/inspection',
    requirePermission('booking.inspect'),
    validate({ body: inspectionSchema }),
    auditAction('booking.inspect', 'booking'),
    async (req, res) => {
      const input = req.valid.body;

      const result = await db.transaction(async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.id, req.params.id), eq(bookings.organisationId, req.org.id)))
          .limit(1);
        if (!booking) throw notFound('That booking could not be found.');
        if (booking.status !== 'RETURNED') {
          throw conflict('The equipment has to be marked as returned before it can be inspected.');
        }

        const deductionTotal = input.deductions.reduce((s, d) => s + d.amountCents, 0);
        // Late fees come out of the bond too, and the bond is the ceiling —
        // this system never ends an inspection with the customer owing money.
        const totalDeduction = Math.min(
          deductionTotal + booking.lateFeeCents,
          booking.bondTotalCents,
        );
        const bondRefundCents = Math.max(0, booking.bondTotalCents - totalDeduction);

        const [inspection] = await tx
          .insert(inspections)
          .values({
            organisationId: req.org.id,
            bookingId: booking.id,
            inspectedBy: req.auth.userId,
            inspectedAt: now(),
            allItemsReturned: input.allItemsReturned,
            totalDeductionCents: totalDeduction,
            bondRefundCents,
            summary: input.summary ?? null,
            signedOffAt: now(),
            signedOffBy: req.auth.userId,
          })
          .onConflictDoUpdate({
            target: inspections.bookingId,
            set: {
              inspectedBy: req.auth.userId,
              inspectedAt: now(),
              allItemsReturned: input.allItemsReturned,
              totalDeductionCents: totalDeduction,
              bondRefundCents,
              summary: input.summary ?? null,
              signedOffAt: now(),
              signedOffBy: req.auth.userId,
            },
          })
          .returning();

        for (const item of input.items) {
          await tx.insert(inspectionItems).values({
            inspectionId: inspection.id,
            bookingItemId: item.bookingItemId,
            unitId: item.unitId ?? null,
            quantityReturned: item.quantityReturned,
            quantityMissing: item.quantityMissing,
            conditionOnReturn: item.conditionOnReturn,
            isDamaged: item.isDamaged,
            isCleaningRequired: item.isCleaningRequired,
            notes: item.notes ?? null,
            photoFileId: item.photoFileId ?? null,
          });

          // Damaged or missing units leave the available pool automatically,
          // so the next customer cannot book a broken marquee.
          if (item.unitId && (item.isDamaged || item.quantityMissing > 0)) {
            await tx
              .update(equipmentUnits)
              .set({
                status: item.quantityMissing > 0 ? 'LOST' : 'DAMAGED',
                condition: item.conditionOnReturn,
              })
              .where(eq(equipmentUnits.id, item.unitId));
          }

          if (item.unitId) {
            await tx.insert(conditionLogs).values({
              organisationId: req.org.id,
              equipmentId: (
                await tx
                  .select({ equipmentId: equipmentUnits.equipmentId })
                  .from(equipmentUnits)
                  .where(eq(equipmentUnits.id, item.unitId))
                  .limit(1)
              )[0]?.equipmentId,
              unitId: item.unitId,
              bookingId: booking.id,
              context: 'RETURN',
              condition: item.conditionOnReturn,
              notes: item.notes ?? null,
              photoFileId: item.photoFileId ?? null,
              recordedBy: req.auth.userId,
            });
          }
        }

        for (const d of input.deductions) {
          await tx.insert(bondDeductions).values({
            organisationId: req.org.id,
            inspectionId: inspection.id,
            bookingId: booking.id,
            kind: d.kind,
            amountCents: d.amountCents,
            description: d.description,
            createdBy: req.auth.userId,
          });
        }
        if (booking.lateFeeCents > 0) {
          await tx.insert(bondDeductions).values({
            organisationId: req.org.id,
            inspectionId: inspection.id,
            bookingId: booking.id,
            kind: 'LATE_RETURN',
            amountCents: Math.min(booking.lateFeeCents, booking.bondTotalCents),
            description: 'Late return fee',
            createdBy: req.auth.userId,
          });
        }

        const updated = await transition(tx, {
          booking,
          to: 'COMPLETED',
          actorUserId: req.auth.userId,
          reason: 'Inspection signed off',
          meta: { inspectionId: inspection.id, bondRefundCents },
          set: { completedAt: now() },
        });

        const [customer] = await tx
          .select()
          .from(users)
          .where(eq(users.id, booking.userId))
          .limit(1);
        const webUrl = await getAppUrl(req.org, 'web', tx);
        if (booking.bondTotalCents > 0) {
          await enqueueEmail(tx, {
            organisationId: req.org.id,
            templateCode: 'booking.bond_refunded',
            toEmail: customer.email,
            toName: customer.firstName,
            userId: customer.id,
            bookingId: booking.id,
            variables: {
              siteUrl: webUrl,
              customer: { firstName: customer.firstName },
              booking: {
                reference: booking.reference,
                url: `${webUrl}/account/bookings/${booking.reference}`,
              },
              refundLabel: formatMoney(bondRefundCents, req.org.currency),
              deductionLabel: totalDeduction ? formatMoney(totalDeduction, req.org.currency) : '',
              deductionReasons: [
                ...input.deductions.map(
                  (d) => `${d.description} — ${formatMoney(d.amountCents, req.org.currency)}`,
                ),
                ...(booking.lateFeeCents
                  ? [`Late return — ${formatMoney(booking.lateFeeCents, req.org.currency)}`]
                  : []),
              ],
            },
          });
        }

        return { inspection, booking: updated, bondRefundCents, totalDeduction };
      });

      // Refund queued after commit, so a Stripe outage cannot roll back a
      // completed inspection.
      if (result.bondRefundCents > 0) {
        await requestRefund({
          org: req.org,
          bookingId: req.params.id,
          amountCents: result.bondRefundCents,
          reasonCode: 'BOND_RETURN',
          reasonNote: 'Bond released after inspection',
          actor: req.auth,
        }).catch(() => {});
      }

      dispatchOutboxSoon();
      res.json({ data: result });
    },
  );

  /** Swap the physical unit assigned to a line. */
  router.post(
    '/:id/reallocate',
    requirePermission('booking.allocate'),
    validate({ body: reallocateSchema }),
    auditAction('booking.reallocate', 'booking'),
    async (req, res) => {
      const { allocationId, newUnitId } = req.valid.body;
      const result = await db.transaction(async (tx) => {
        const [allocation] = await tx
          .select()
          .from(bookingAllocations)
          .where(
            and(
              eq(bookingAllocations.id, allocationId),
              eq(bookingAllocations.bookingId, req.params.id),
            ),
          )
          .limit(1);
        if (!allocation) throw notFound('That allocation could not be found.');

        // Point both the allocation and its block at the new unit. If the new
        // unit is already booked for the period, the exclusion constraint
        // rejects this update and the request becomes a 409 — exactly the
        // protection we want on a manual swap.
        await tx
          .update(availabilityBlocks)
          .set({ unitId: newUnitId })
          .where(eq(availabilityBlocks.id, allocation.availabilityBlockId));
        const [updated] = await tx
          .update(bookingAllocations)
          .set({ unitId: newUnitId })
          .where(eq(bookingAllocations.id, allocationId))
          .returning();
        return updated;
      });
      res.json({ data: result });
    },
  );

  return router;
}
