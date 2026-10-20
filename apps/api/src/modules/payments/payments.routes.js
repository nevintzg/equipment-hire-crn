import { Router, raw } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { auditAction } from '#src/modules/audit/audit.service.js';
import * as service from './payments.service.js';

/**
 * The Stripe webhook.
 *
 * Mounted with a raw body parser, and mounted before express.json() in app.js:
 * signature verification runs over the exact bytes Stripe sent, and a parsed
 * then re-serialised body will not match. This route is also deliberately
 * outside the rate limiter — throttling Stripe would mean dropping payment
 * confirmations.
 */
export function createWebhookRouter() {
  const router = Router();

  router.post('/stripe', raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const result = await service.handleWebhook({
      rawBody: req.body,
      signature: req.headers['stripe-signature'],
      org: req.org,
    });
    // Always 200 once handled, so Stripe stops retrying.
    res.json({ received: true, ...result });
  });

  return router;
}

/** Staff finance routes. */
export function createAdminPaymentsRouter() {
  const router = Router();
  router.use(authenticate('admin'));

  router.get('/bookings/:id', requirePermission('payment.view'), async (req, res) => {
    res.json({
      data: await service.listPaymentsForBooking({ org: req.org, bookingId: req.params.id }),
    });
  });

  router.get('/bonds-awaiting-release', requirePermission('payment.view'), async (req, res) => {
    res.json({ data: await service.bondsAwaitingRelease({ org: req.org }) });
  });

  router.post(
    '/bookings/:id/manual',
    requirePermission('payment.record'),
    validate({
      body: z.object({
        method: z.enum(['BANK_TRANSFER', 'CASH', 'WAIVED']),
        hireAmountCents: z.number().int().min(0),
        bondAmountCents: z.number().int().min(0).default(0),
        reference: z.string().trim().max(120).optional(),
      }),
    }),
    auditAction('payment.record_manual', 'payment'),
    async (req, res) => {
      const payment = await service.recordManualPayment({
        org: req.org,
        bookingId: req.params.id,
        input: req.valid.body,
        actor: req.auth,
      });
      res.status(201).json({ data: payment });
    },
  );

  router.post(
    '/bookings/:id/refund',
    requirePermission('payment.refund'),
    validate({
      body: z.object({
        amountCents: z.number().int().min(1),
        reasonCode: z.enum(['BOND_RETURN', 'CANCELLATION', 'GOODWILL', 'OVERPAYMENT']),
        reasonNote: z.string().trim().max(500).optional(),
      }),
    }),
    auditAction('payment.refund', 'refund'),
    async (req, res) => {
      const refund = await service.requestRefund({
        org: req.org,
        bookingId: req.params.id,
        ...req.valid.body,
        actor: req.auth,
      });
      res.status(201).json({ data: refund });
    },
  );

  return router;
}
