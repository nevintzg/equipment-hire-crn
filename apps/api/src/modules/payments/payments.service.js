import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import {
  bookings,
  inspections,
  organisations,
  payments,
  refunds,
  stripeEvents,
  users,
} from '#src/db/schema/index.js';
import { stripeFor, webhookSecretFor } from './stripe.client.js';
import { transition } from '#src/modules/bookings/booking-state.js';
import { getSettings } from '#src/modules/settings/settings.service.js';
import { getAppUrl } from '#src/modules/site/site.service.js';
import { dispatchOutboxSoon, enqueueEmail } from '#src/modules/notifications/outbox.service.js';
import { badRequest, conflict, notFound, unavailable } from '#src/lib/errors.js';
import { formatDateTime, formatMoney } from '#src/lib/format.js';
import { now } from '#src/lib/time.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('payments');

/**
 * Payments.
 *
 * Design decisions worth knowing before changing anything here:
 *
 * 1. Hire fee and bond are charged together, once, after approval. The
 *    textbook alternative is to authorise the bond and capture only on damage,
 *    but a card authorisation expires in roughly seven days and community
 *    bookings are made months ahead. So the bond is a real payment, refunded
 *    after inspection.
 *
 * 2. Stripe Checkout, not Elements. The API never sees a card number, which
 *    takes this project almost entirely out of PCI scope — the right trade for
 *    a volunteer-run organisation with no security team.
 *
 * 3. The webhook, not the browser redirect, is what confirms a booking. A
 *    customer who closes the tab after paying must still end up confirmed.
 *
 * 4. Every Stripe write carries an idempotency key, and every Stripe event is
 *    recorded before it is acted on. Stripe delivers at least once, so
 *    duplicates are a certainty, not an edge case.
 */

/** Resolve the organisation row, which carries any per-org Stripe keys. */
async function orgRow(organisationId) {
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, organisationId))
    .limit(1);
  if (!org) throw notFound('Organisation not found.');
  return org;
}

/**
 * Create (or re-use) a Checkout session for an approved booking.
 *
 * Re-use matters: a customer who clicks "Pay" twice should land on the same
 * session rather than create a second one that could also be paid.
 */
export async function createCheckoutSession({ org, user, reference }) {
  const settings = await getSettings(org.id);
  if (settings['payments.enabled'] === false) {
    throw conflict('Online payment is not available. Please contact us to arrange payment.');
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, org.id),
        eq(bookings.reference, reference),
        eq(bookings.userId, user.id),
      ),
    )
    .limit(1);

  if (!booking) throw notFound('That booking could not be found.');
  if (booking.status === 'CONFIRMED') throw conflict('This booking has already been paid for.');
  if (booking.status !== 'APPROVED') {
    throw conflict('This booking is not ready for payment yet.');
  }
  if (booking.paymentDueAt && booking.paymentDueAt < now()) {
    throw conflict('The payment window for this booking has closed. Please submit a new request.');
  }
  if (booking.totalDueCents <= 0) {
    // Nothing to pay — free hire. Confirm it directly rather than sending the
    // customer to Stripe for a $0 session.
    return confirmFreeBooking({ org, booking, user });
  }

  // An existing unexpired session for this booking.
  const [existing] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, booking.id),
        eq(payments.status, 'REQUIRES_PAYMENT'),
        eq(payments.method, 'STRIPE_CARD'),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);

  const stripe = stripeFor(await orgRow(org.id));
  const webUrl = await getAppUrl(org, 'web');

  if (existing?.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
      if (session.status === 'open' && session.url) {
        return { url: session.url, paymentId: existing.id, reused: true };
      }
    } catch (err) {
      log.warn({ err, paymentId: existing.id }, 'Could not reuse checkout session');
    }
  }

  const hireCents = booking.hireSubtotalCents - booking.discountCents;
  const lineItems = [
    {
      price_data: {
        currency: org.currency.toLowerCase(),
        unit_amount: hireCents,
        product_data: {
          name: `Equipment hire — ${booking.reference}`,
          description: `${formatDateTime(booking.startAt, org.timezone)} to ${formatDateTime(booking.endAt, org.timezone)}`,
        },
      },
      quantity: 1,
    },
  ];
  if (booking.bondTotalCents > 0) {
    lineItems.push({
      price_data: {
        currency: org.currency.toLowerCase(),
        unit_amount: booking.bondTotalCents,
        product_data: {
          name: 'Refundable bond',
          description: 'Returned after the equipment is checked back in.',
        },
      },
      quantity: 1,
    });
  }

  // Deterministic key: a retried request produces the same session rather than
  // a second one.
  const idempotencyKey = `checkout:${booking.id}:${booking.version}`;

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: lineItems,
        customer_email: user.email,
        client_reference_id: booking.id,
        // The webhook reads these, so it never has to guess which booking a
        // payment belongs to.
        metadata: {
          bookingId: booking.id,
          organisationId: org.id,
          reference: booking.reference,
          hireCents: String(hireCents),
          bondCents: String(booking.bondTotalCents),
        },
        payment_intent_data: {
          description: `Hire ${booking.reference}`,
          metadata: { bookingId: booking.id, organisationId: org.id },
        },
        success_url: `${webUrl}/bookings/${booking.reference}/paid?session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${webUrl}/account/bookings/${booking.reference}`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      },
      { idempotencyKey },
    );
  } catch (err) {
    log.error({ err, bookingId: booking.id }, 'Stripe checkout session failed');
    throw unavailable('Payment could not be started just now. Please try again in a moment.');
  }

  const [payment] = await db
    .insert(payments)
    .values({
      organisationId: org.id,
      bookingId: booking.id,
      purpose: 'HIRE_AND_BOND',
      method: 'STRIPE_CARD',
      status: 'REQUIRES_PAYMENT',
      hireAmountCents: hireCents,
      bondAmountCents: booking.bondTotalCents,
      amountCents: booking.totalDueCents,
      currency: org.currency,
      stripeCheckoutSessionId: session.id,
      idempotencyKey,
    })
    .onConflictDoUpdate({
      target: payments.idempotencyKey,
      set: { stripeCheckoutSessionId: session.id },
    })
    .returning();

  return { url: session.url, paymentId: payment.id, reused: false };
}

/** A hire with nothing to pay still needs to become CONFIRMED. */
async function confirmFreeBooking({ org, booking, user }) {
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(payments)
      .values({
        organisationId: org.id,
        bookingId: booking.id,
        purpose: 'HIRE_AND_BOND',
        method: 'WAIVED',
        status: 'SUCCEEDED',
        hireAmountCents: 0,
        bondAmountCents: 0,
        amountCents: 0,
        currency: org.currency,
        paidAt: now(),
        idempotencyKey: `free:${booking.id}`,
      })
      .onConflictDoNothing()
      .returning();

    await markConfirmed(tx, { org, booking, user, payment });
  });
  dispatchOutboxSoon();
  const webUrl = await getAppUrl(org, 'web');
  return { url: `${webUrl}/account/bookings/${booking.reference}`, free: true };
}

/** Shared CONFIRMED transition and email. */
async function markConfirmed(tx, { org, booking, user, payment }) {
  const updated = await transition(tx, {
    booking,
    to: 'CONFIRMED',
    actorKind: 'SYSTEM',
    reason: 'Payment received',
    meta: { paymentId: payment?.id ?? null },
    set: { confirmedAt: now() },
  });

  const webUrl = await getAppUrl(org, 'web', tx);
  const customer =
    user ?? (await tx.select().from(users).where(eq(users.id, booking.userId)).limit(1))[0];

  await enqueueEmail(tx, {
    organisationId: org.id,
    templateCode: 'booking.confirmed',
    toEmail: customer.email,
    toName: customer.firstName,
    userId: customer.id,
    bookingId: booking.id,
    variables: {
      siteUrl: webUrl,
      customer: { firstName: customer.firstName },
      booking: {
        reference: updated.reference,
        pickupLabel: formatDateTime(updated.startAt, org.timezone),
        returnLabel: formatDateTime(updated.endAt, org.timezone),
        itemsLabel: '',
        hireTotal: formatMoney(updated.hireSubtotalCents - updated.discountCents, org.currency),
        bondTotal: updated.bondTotalCents ? formatMoney(updated.bondTotalCents, org.currency) : '',
        totalDue: formatMoney(updated.totalDueCents, org.currency),
        url: `${webUrl}/account/bookings/${updated.reference}`,
      },
    },
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify and handle a Stripe webhook.
 *
 * `rawBody` must be the exact bytes Stripe sent — signature verification is
 * over the raw payload, so app.js mounts this route with a raw body parser
 * before express.json() can touch it.
 *
 * @param {object} p
 * @param {Buffer} p.rawBody
 * @param {string} p.signature
 * @param {object} p.org
 */
export async function handleWebhook({ rawBody, signature, org }) {
  const organisation = await orgRow(org.id);
  const stripe = stripeFor(organisation);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecretFor(organisation));
  } catch (err) {
    // Anything that fails verification is either misconfiguration or an
    // attacker. Both get a 400 and no further processing.
    log.warn({ err: err.message }, 'Webhook signature verification failed');
    throw badRequest('Invalid webhook signature.');
  }

  // Record first. The unique index on stripe_event_id makes replay a no-op:
  // the insert fails, we return early, and the work is not repeated.
  try {
    await db.insert(stripeEvents).values({
      organisationId: org.id,
      stripeEventId: event.id,
      type: event.type,
      payload: event.data?.object ? { id: event.data.object.id, type: event.type } : {},
    });
  } catch (err) {
    if (err?.code === '23505') {
      log.info({ eventId: event.id, type: event.type }, 'Duplicate webhook ignored');
      return { duplicate: true, type: event.type };
    }
    throw err;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(org, event.data.object);
        break;
      case 'checkout.session.expired':
        await onCheckoutExpired(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await onPaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await onChargeRefunded(event.data.object);
        break;
      default:
        log.debug({ type: event.type }, 'Unhandled webhook type');
    }

    await db
      .update(stripeEvents)
      .set({ processedAt: now() })
      .where(eq(stripeEvents.stripeEventId, event.id));
  } catch (err) {
    // Record the failure and rethrow: a 500 makes Stripe retry, which is what
    // we want for a transient problem.
    log.error({ err, eventId: event.id, type: event.type }, 'Webhook handler failed');
    await db
      .update(stripeEvents)
      .set({ error: String(err?.message ?? err).slice(0, 500) })
      .where(eq(stripeEvents.stripeEventId, event.id));
    throw err;
  }

  dispatchOutboxSoon();
  return { handled: true, type: event.type };
}

async function onCheckoutCompleted(org, session) {
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id;
  if (!bookingId) {
    log.error({ sessionId: session.id }, 'Checkout session has no booking reference');
    return;
  }

  await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .for('update');
    if (!booking) {
      log.error({ bookingId }, 'Checkout completed for unknown booking');
      return;
    }

    await tx
      .update(payments)
      .set({
        status: 'SUCCEEDED',
        paidAt: now(),
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      })
      .where(eq(payments.stripeCheckoutSessionId, session.id));

    // The booking may already be CONFIRMED if the success redirect raced the
    // webhook, or CANCELLED if staff acted while the customer was paying.
    if (booking.status === 'CONFIRMED') {
      log.info({ bookingId }, 'Booking already confirmed; webhook was a duplicate path');
      return;
    }
    if (booking.status !== 'APPROVED') {
      // Money has arrived for a booking that can no longer proceed. Do not
      // silently keep it — flag it for staff to refund.
      log.error(
        { bookingId, status: booking.status },
        'Payment received for a booking that is not approved — needs manual refund',
      );
      await tx.insert(refunds).values({
        organisationId: booking.organisationId,
        paymentId: (
          await tx
            .select({ id: payments.id })
            .from(payments)
            .where(eq(payments.stripeCheckoutSessionId, session.id))
            .limit(1)
        )[0]?.id,
        bookingId: booking.id,
        amountCents: session.amount_total ?? 0,
        reasonCode: 'OVERPAYMENT',
        reasonNote: `Paid while booking was ${booking.status}`,
        status: 'PENDING',
      });
      return;
    }

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripeCheckoutSessionId, session.id))
      .limit(1);

    await markConfirmed(tx, {
      org: { ...org, ...booking, id: booking.organisationId },
      booking,
      payment,
    });
  });
}

async function onCheckoutExpired(session) {
  await db
    .update(payments)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        eq(payments.stripeCheckoutSessionId, session.id),
        eq(payments.status, 'REQUIRES_PAYMENT'),
      ),
    );
}

async function onPaymentFailed(intent) {
  await db
    .update(payments)
    .set({
      status: 'FAILED',
      failedAt: now(),
      failureReason: intent.last_payment_error?.message?.slice(0, 500) ?? 'Payment failed',
    })
    .where(eq(payments.stripePaymentIntentId, intent.id));
}

/** Keep refunded totals in step when a refund is issued from the Stripe dashboard. */
async function onChargeRefunded(charge) {
  const [payment] = await db
    .select({ id: payments.id, amountCents: payments.amountCents })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, charge.payment_intent))
    .limit(1);
  if (!payment) return;

  const refunded = charge.amount_refunded ?? 0;
  await db
    .update(payments)
    .set({
      refundedCents: refunded,
      status: refunded >= payment.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    })
    .where(eq(payments.id, payment.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Refunds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send queued refunds to Stripe. Called by the hourly tick.
 *
 * Refunds are queued as PENDING rows rather than issued inline because the
 * inline version has no safe failure mode: a Stripe call inside a database
 * transaction either holds locks across a network round trip, or succeeds and
 * then gets rolled back. A queued row can be retried as often as needed, and
 * the refund's own id is the idempotency key, so a retry cannot pay twice.
 */
export async function processPendingRefunds({ limit = 20 } = {}) {
  const pending = await db
    .select({
      refund: refunds,
      payment: payments,
      booking: bookings,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(bookings, eq(bookings.id, refunds.bookingId))
    .where(eq(refunds.status, 'PENDING'))
    .orderBy(asc(refunds.createdAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const { refund, payment, booking } of pending) {
    try {
      if (payment.method !== 'STRIPE_CARD' || !payment.stripePaymentIntentId) {
        // Cash, bank transfer or waived: nothing to call. Mark it done so
        // staff see it as settled and handle the money their own way.
        await db
          .update(refunds)
          .set({
            status: 'SUCCEEDED',
            processedAt: now(),
            reasonNote: `${refund.reasonNote ?? ''} (manual method: ${payment.method})`.trim(),
          })
          .where(eq(refunds.id, refund.id));
        processed += 1;
        continue;
      }

      const organisation = await orgRow(refund.organisationId);
      const stripe = stripeFor(organisation);

      const result = await stripe.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: refund.amountCents,
          metadata: { refundId: refund.id, bookingId: booking.id, reason: refund.reasonCode },
        },
        // The refund row's id — a retry of this exact refund is a no-op at
        // Stripe rather than a second payout.
        { idempotencyKey: `refund:${refund.id}` },
      );

      await db.transaction(async (tx) => {
        await tx
          .update(refunds)
          .set({ status: 'SUCCEEDED', stripeRefundId: result.id, processedAt: now() })
          .where(eq(refunds.id, refund.id));
        await tx
          .update(payments)
          .set({
            refundedCents: sql`${payments.refundedCents} + ${refund.amountCents}`,
            status: sql`CASE WHEN ${payments.refundedCents} + ${refund.amountCents} >= ${payments.amountCents}
                             THEN 'REFUNDED'::payment_status
                             ELSE 'PARTIALLY_REFUNDED'::payment_status END`,
          })
          .where(eq(payments.id, payment.id));
      });

      processed += 1;
      log.info({ refundId: refund.id, amountCents: refund.amountCents }, 'Refund issued');
    } catch (err) {
      failed += 1;
      log.error({ err, refundId: refund.id }, 'Refund failed');
      await db
        .update(refunds)
        .set({ status: 'FAILED', failureReason: String(err?.message ?? err).slice(0, 500) })
        .where(eq(refunds.id, refund.id));
    }
  }

  if (pending.length) log.info({ processed, failed }, 'Refund queue drained');
  return { processed, failed };
}

/** Staff-initiated refund, e.g. releasing a bond after inspection. */
export async function requestRefund({
  org,
  bookingId,
  amountCents,
  reasonCode,
  reasonNote,
  actor,
}) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        eq(payments.organisationId, org.id),
        eq(payments.status, 'SUCCEEDED'),
      ),
    )
    .orderBy(desc(payments.paidAt))
    .limit(1);

  if (!payment) throw conflict('There is no payment on this booking to refund.');

  const refundable = payment.amountCents - payment.refundedCents;
  if (amountCents > refundable) {
    throw badRequest(
      `Only ${formatMoney(refundable, org.currency)} is left to refund on this booking.`,
      { refundableCents: refundable },
    );
  }

  const [row] = await db
    .insert(refunds)
    .values({
      organisationId: org.id,
      paymentId: payment.id,
      bookingId,
      amountCents,
      reasonCode,
      reasonNote: reasonNote ?? null,
      requestedBy: actor?.userId ?? null,
      status: 'PENDING',
    })
    .returning();

  // Try immediately so staff see the result while they are still looking at
  // the screen; the tick is the safety net if this fails.
  processPendingRefunds({ limit: 5 }).catch((err) =>
    log.warn({ err }, 'Immediate refund attempt failed; left queued'),
  );

  return row;
}

/** Record a payment taken outside Stripe (cash at the shed, bank transfer). */
export async function recordManualPayment({ org, bookingId, input, actor }) {
  const result = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.organisationId, org.id)))
      .limit(1);
    if (!booking) throw notFound('That booking could not be found.');

    const [payment] = await tx
      .insert(payments)
      .values({
        organisationId: org.id,
        bookingId,
        purpose: 'HIRE_AND_BOND',
        method: input.method,
        status: 'SUCCEEDED',
        hireAmountCents: input.hireAmountCents,
        bondAmountCents: input.bondAmountCents,
        amountCents: input.hireAmountCents + input.bondAmountCents,
        currency: org.currency,
        manualReference: input.reference ?? null,
        recordedBy: actor.userId,
        paidAt: now(),
        idempotencyKey: `manual:${bookingId}:${Date.now()}`,
      })
      .returning();

    if (booking.status === 'APPROVED') {
      await markConfirmed(tx, { org, booking, user: null, payment });
    }
    return payment;
  });

  dispatchOutboxSoon();
  return result;
}

/** Payments and refunds for the finance screens. */
export async function listPaymentsForBooking({ org, bookingId }) {
  const [paymentRows, refundRows] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(and(eq(payments.organisationId, org.id), eq(payments.bookingId, bookingId)))
      .orderBy(desc(payments.createdAt)),
    db
      .select()
      .from(refunds)
      .where(and(eq(refunds.organisationId, org.id), eq(refunds.bookingId, bookingId)))
      .orderBy(desc(refunds.createdAt)),
  ]);
  return { payments: paymentRows, refunds: refundRows };
}

/** Bookings whose bond is waiting on a signed-off inspection. */
export async function bondsAwaitingRelease({ org }) {
  return db
    .select({
      bookingId: bookings.id,
      reference: bookings.reference,
      bondTotalCents: bookings.bondTotalCents,
      returnedAt: bookings.returnedAt,
      inspectionId: inspections.id,
      signedOffAt: inspections.signedOffAt,
      bondRefundCents: inspections.bondRefundCents,
    })
    .from(bookings)
    .leftJoin(inspections, eq(inspections.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.organisationId, org.id),
        inArray(bookings.status, ['RETURNED']),
        lte(bookings.bondTotalCents, sql`${bookings.bondTotalCents}`),
        isNull(inspections.signedOffAt),
      ),
    )
    .orderBy(asc(bookings.returnedAt))
    .limit(100);
}
