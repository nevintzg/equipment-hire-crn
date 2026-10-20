import { Router } from 'express';
import { authenticate, requireVerifiedEmail } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { bookingLimiter } from '#src/middleware/rate-limit.js';
import { paginationSchema } from '#src/lib/pagination.js';
import { z } from 'zod';
import { cancelBookingSchema, createBookingSchema, quoteSchema } from './bookings.schemas.js';
import * as service from './bookings.service.js';
import { createCheckoutSession } from '#src/modules/payments/payments.service.js';

/** Customer-facing booking routes. */
export function createBookingsRouter() {
  const router = Router();
  router.use(authenticate('web'));

  /**
   * Price a basket. Not rate-limited as tightly as creation, because the
   * checkout page calls it on every change — but it writes nothing.
   */
  router.post('/quote', validate({ body: quoteSchema }), async (req, res) => {
    const result = await service.quote({
      org: req.org,
      user: req.auth.user,
      input: req.valid.body,
    });
    res.json({ data: result });
  });

  router.post(
    '/',
    bookingLimiter,
    requireVerifiedEmail,
    validate({ body: createBookingSchema }),
    async (req, res) => {
      const { booking, decision } = await service.createBooking({
        org: req.org,
        user: req.auth.user,
        input: req.valid.body,
      });
      res.status(201).json({
        data: {
          id: booking.id,
          reference: booking.reference,
          status: booking.status,
          totalDueCents: booking.totalDueCents,
          paymentDueAt: booking.paymentDueAt,
          autoApproved: decision.approved,
          // The frontend uses this to decide whether to go straight to payment
          // or show "we will review your request".
          nextStep: decision.approved ? 'PAYMENT' : 'AWAITING_REVIEW',
        },
      });
    },
  );

  router.get(
    '/',
    validate({
      query: paginationSchema.extend({
        status: z.string().max(32).optional(),
      }),
    }),
    async (req, res) => {
      res.json(await service.listMyBookings({ user: req.auth.user, query: req.valid.query }));
    },
  );

  router.get('/:reference', async (req, res) => {
    const booking = await service.getMyBooking({
      org: req.org,
      user: req.auth.user,
      reference: req.params.reference,
    });
    res.json({ data: booking });
  });

  router.post('/:reference/cancel', validate({ body: cancelBookingSchema }), async (req, res) => {
    const result = await service.cancelMyBooking({
      org: req.org,
      user: req.auth.user,
      reference: req.params.reference,
      reason: req.valid.body.reason,
    });
    res.json({
      data: {
        status: result.booking.status,
        refund: {
          amountCents: result.refund.refundCents,
          explanation: result.refund.explanation,
        },
      },
    });
  });

  /** Start payment. Returns a Stripe Checkout URL for the browser to visit. */
  router.post('/:reference/checkout', bookingLimiter, async (req, res) => {
    const result = await createCheckoutSession({
      org: req.org,
      user: req.auth.user,
      reference: req.params.reference,
    });
    res.json({ data: result });
  });

  return router;
}
