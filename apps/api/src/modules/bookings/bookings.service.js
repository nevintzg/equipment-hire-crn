import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import {
  autoApprovalRules,
  bookingAllocations,
  bookingAnswers,
  bookingItems,
  bookingQuestions,
  bookings,
  cancellationTiers,
  equipment,
  equipmentPrices,
  locationSlots,
  organisations,
  payments,
  refunds,
  users,
} from '#src/db/schema/index.js';
import { gstComponent, quoteBooking } from '#src/modules/pricing/pricing.js';
import { checkHireRules, isClosedDate, withinSlots } from './booking-rules.js';
import { evaluateAutoApproval } from './auto-approval.js';
import { cancellationRefund } from './cancellation.js';
import { CUSTOMER_CANCELLABLE, effectiveStatus, humanStatus, transition } from './booking-state.js';
import { allocateUnits, lockEquipment } from '#src/modules/availability/availability.service.js';
import { getSettings } from '#src/modules/settings/settings.service.js';
import { getAppUrl, getCurrentTerms } from '#src/modules/site/site.service.js';
import { enqueueEmail, dispatchOutboxSoon } from '#src/modules/notifications/outbox.service.js';
import { staffRecipients } from '#src/modules/notifications/recipients.js';
import { badRequest, conflict, forbidden, notFound } from '#src/lib/errors.js';
import { bookingReference } from '#src/lib/tokens.js';
import { addHours, hireDays, localDateTime, now } from '#src/lib/time.js';
import { formatDateTime, formatMoney, pluralise } from '#src/lib/format.js';
import { paginated, toLimitOffset } from '#src/lib/pagination.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('bookings');

// ─────────────────────────────────────────────────────────────────────────────
// Quoting
// ─────────────────────────────────────────────────────────────────────────────

/** Load the equipment and rates a basket needs, in two queries not 2N. */
async function loadBasket(tx, org, items) {
  const ids = items.map((i) => i.equipmentId);

  const rows = await tx
    .select()
    .from(equipment)
    .where(
      and(
        eq(equipment.organisationId, org.id),
        inArray(equipment.id, ids),
        isNull(equipment.deletedAt),
      ),
    );

  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) throw notFound('One of the items in your basket is no longer available.');

  const rates = await tx
    .select()
    .from(equipmentPrices)
    .where(and(inArray(equipmentPrices.equipmentId, ids), eq(equipmentPrices.isActive, true)));

  const byId = new Map(rows.map((r) => [r.id, r]));
  return items.map((i) => ({
    equipment: byId.get(i.equipmentId),
    quantity: i.quantity,
    notes: i.notes,
    rates: rates.filter((r) => r.equipmentId === i.equipmentId),
  }));
}

/** Turn local dates and slot times into UTC instants. */
function resolveWindow(input, timezone) {
  const startAt = localDateTime(input.startDate, input.startTime, timezone);
  const endAt = localDateTime(input.endDate, input.endTime, timezone);
  if (!startAt || !endAt) throw badRequest('Those dates are not valid.');
  return { startAt, endAt };
}

/**
 * Price a basket without creating anything.
 *
 * The checkout page calls this on every change, so it must be cheap and must
 * never write. It returns the same numbers createBooking will use, because both
 * go through the same pure pricing module.
 */
export async function quote({ org, user, input }) {
  const settings = await getSettings(org.id);
  const { startAt, endAt } = resolveWindow(input, org.timezone);
  const basket = await loadBasket(db, org, input.items);

  const { errors } = checkHireRules({
    items: basket,
    startAt,
    endAt,
    timezone: org.timezone,
  });

  const closedDates = settings['booking.closedDates'] ?? [];
  if (isClosedDate(startAt, closedDates, org.timezone)) {
    errors.push({ equipmentId: null, message: 'We are closed on your collection date.' });
  }
  if (isClosedDate(endAt, closedDates, org.timezone)) {
    errors.push({ equipmentId: null, message: 'We are closed on your return date.' });
  }

  const days = hireDays(startAt, endAt, org.timezone);
  const priced = quoteBooking({
    items: basket.map((b) => ({
      equipmentId: b.equipment.id,
      name: b.equipment.name,
      quantity: b.quantity,
      rates: b.rates,
      bondCents: b.equipment.bondCents,
    })),
    units: days,
    customer: {
      customerTypeId: user?.customerTypeId ?? null,
      customerTypeConfirmed: Boolean(user?.customerTypeConfirmedAt),
    },
    taxRateBp: org.taxRateBp,
    bondsEnabled: settings['payments.bondsEnabled'] !== false,
  });

  return {
    ...priced,
    startAt,
    endAt,
    days,
    currency: org.currency,
    errors,
    bookable: errors.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creating a booking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a booking.
 *
 * The whole thing is one transaction, and the order inside it matters:
 *
 *   1. lock the equipment rows (serialises concurrent baskets),
 *   2. re-price from the database — never trust a total from the client,
 *   3. insert the booking and its lines,
 *   4. allocate stock, which is where a race loses and the transaction aborts,
 *   5. decide auto-approval,
 *   6. queue the emails *in the same transaction* (the outbox).
 *
 * If step 4 fails because someone else just took the last marquee, nothing is
 * written and no email goes out. That atomicity is the reason the outbox
 * exists.
 */
export async function createBooking({ org, user, input }) {
  const settings = await getSettings(org.id);

  if (settings['booking.requireEmailVerification'] && !user.emailVerifiedAt) {
    throw forbidden('Please confirm your email address before booking. Check your inbox.');
  }
  if (settings['booking.requirePhone'] && !user.phone) {
    throw badRequest('Please add a phone number to your profile before booking.', [
      { field: 'phone', message: 'A contact number is required for hires.' },
    ]);
  }

  const activeLimit = settings['booking.maxActiveBookingsPerCustomer'] ?? 3;
  const [{ activeCount } = { activeCount: 0 }] = await db
    .select({ activeCount: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.userId, user.id),
        inArray(bookings.status, ['PENDING_REVIEW', 'APPROVED', 'CONFIRMED', 'PICKED_UP']),
      ),
    );
  if (Number(activeCount) >= activeLimit) {
    throw conflict(
      `You already have ${pluralise(Number(activeCount), 'booking')} on the go. Please complete one before making another.`,
    );
  }

  const { startAt, endAt } = resolveWindow(input, org.timezone);
  const terms = await getCurrentTerms(org);
  if (settings['booking.termsRequired'] && !terms) {
    throw conflict('Hire terms have not been published yet. Please contact us.');
  }

  const created = await db.transaction(async (tx) => {
    // (1) Serialise against other baskets touching the same equipment.
    await lockEquipment(
      tx,
      input.items.map((i) => i.equipmentId),
    );

    const basket = await loadBasket(tx, org, input.items);

    const { errors } = checkHireRules({ items: basket, startAt, endAt, timezone: org.timezone });
    if (errors.length) throw badRequest('This booking cannot be made as requested.', errors);

    const closedDates = settings['booking.closedDates'] ?? [];
    if (
      isClosedDate(startAt, closedDates, org.timezone) ||
      isClosedDate(endAt, closedDates, org.timezone)
    ) {
      throw badRequest('We are closed on one of those dates. Please choose different dates.');
    }

    // Handover windows, if the organisation publishes any.
    const slots = await tx
      .select()
      .from(locationSlots)
      .where(and(eq(locationSlots.organisationId, org.id), eq(locationSlots.isActive, true)));
    if (slots.length) {
      if (!withinSlots(startAt, slots, 'PICKUP', org.timezone)) {
        throw badRequest('That collection time is outside our opening hours.');
      }
      if (!withinSlots(endAt, slots, 'RETURN', org.timezone)) {
        throw badRequest('That return time is outside our opening hours.');
      }
    }

    // (2) Re-price server-side.
    const days = hireDays(startAt, endAt, org.timezone);
    const priced = quoteBooking({
      items: basket.map((b) => ({
        equipmentId: b.equipment.id,
        name: b.equipment.name,
        quantity: b.quantity,
        rates: b.rates,
        bondCents: b.equipment.bondCents,
      })),
      units: days,
      customer: {
        customerTypeId: user.customerTypeId,
        customerTypeConfirmed: Boolean(user.customerTypeConfirmedAt),
      },
      taxRateBp: org.taxRateBp,
      bondsEnabled: settings['payments.bondsEnabled'] !== false,
    });

    // (3) The booking row. Reference collisions are vanishingly unlikely but
    // the unique index is the guarantee, so retry a few times rather than
    // failing the customer's submission.
    let booking;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        [booking] = await tx
          .insert(bookings)
          .values({
            organisationId: org.id,
            reference: bookingReference(),
            userId: user.id,
            status: 'PENDING_REVIEW',
            startAt,
            endAt,
            bookingUnit: basket[0].equipment.bookingUnit,
            chargeableUnits: days,
            pickupLocationId: input.pickupLocationId ?? null,
            returnLocationId: input.returnLocationId ?? input.pickupLocationId ?? null,
            pickupSlotId: input.pickupSlotId ?? null,
            returnSlotId: input.returnSlotId ?? null,
            customerTypeId: user.customerTypeConfirmedAt ? user.customerTypeId : null,
            hireSubtotalCents: priced.hireSubtotalCents,
            bondTotalCents: priced.bondTotalCents,
            discountCents: priced.discountCents,
            totalDueCents: priced.totalDueCents,
            gstCents: priced.gstCents,
            taxRateBp: priced.taxRateBp,
            purpose: input.purpose ?? null,
            expectedAttendees: input.expectedAttendees ?? null,
            deliveryRequired: input.deliveryRequired ?? false,
            deliveryAddress: input.deliveryAddress ?? null,
            customerNotes: input.customerNotes ?? null,
            termsVersionId: terms?.id ?? null,
            termsAcceptedAt: now(),
            submittedAt: now(),
          })
          .returning();
        break;
      } catch (err) {
        const isReferenceClash =
          err?.code === '23505' && String(err?.constraint).includes('reference');
        if (!isReferenceClash || attempt === 4) throw err;
      }
    }

    const lines = [];
    for (const line of priced.lines) {
      const item = basket.find((b) => b.equipment.id === line.equipmentId);
      const [row] = await tx
        .insert(bookingItems)
        .values({
          organisationId: org.id,
          bookingId: booking.id,
          equipmentId: line.equipmentId,
          quantity: line.quantity,
          nameSnapshot: line.name,
          unitRateCents: line.unitRateCents,
          ratePeriodSnapshot: line.ratePeriod,
          lineHireCents: line.lineHireCents,
          lineBondCents: line.lineBondCents,
          priceBreakdown: { breakdown: line.breakdown, tier: line.tier, capped: line.capped },
          notes: item?.notes ?? null,
        })
        .returning();
      lines.push({ row, item });
    }

    // (4) Reserve the stock. A lost race aborts the transaction here.
    for (const { row, item } of lines) {
      const { allocations } = await allocateUnits(tx, {
        organisationId: org.id,
        bookingId: booking.id,
        bookingItemId: row.id,
        equipmentItem: item.equipment,
        quantity: row.quantity,
        start: startAt,
        end: endAt,
        createdBy: user.id,
      });
      if (allocations.length) {
        await tx.insert(bookingAllocations).values(
          allocations.map((a) => ({
            organisationId: org.id,
            bookingId: booking.id,
            bookingItemId: a.bookingItemId,
            unitId: a.unitId,
            availabilityBlockId: a.availabilityBlockId,
          })),
        );
      }
    }

    // Checkout answers.
    if (input.answers?.length) {
      const questions = await tx
        .select({
          id: bookingQuestions.id,
          label: bookingQuestions.label,
          isRequired: bookingQuestions.isRequired,
        })
        .from(bookingQuestions)
        .where(
          and(eq(bookingQuestions.organisationId, org.id), eq(bookingQuestions.isActive, true)),
        );
      const required = questions.filter((q) => q.isRequired);
      const answered = new Set(
        input.answers.filter((a) => a.answer?.trim()).map((a) => a.questionId),
      );
      const unanswered = required.filter((q) => !answered.has(q.id));
      if (unanswered.length) {
        throw badRequest(
          'Please answer all required questions.',
          unanswered.map((q) => ({ field: q.id, message: `${q.label} is required` })),
        );
      }
      const valid = input.answers.filter((a) => questions.some((q) => q.id === a.questionId));
      if (valid.length) {
        await tx.insert(bookingAnswers).values(
          valid.map((a) => ({
            bookingId: booking.id,
            questionId: a.questionId,
            labelSnapshot: questions.find((q) => q.id === a.questionId).label,
            answer: a.answer,
          })),
        );
      }
    }

    // (5) Auto-approval.
    const rules = await tx
      .select()
      .from(autoApprovalRules)
      .where(
        and(eq(autoApprovalRules.organisationId, org.id), eq(autoApprovalRules.isActive, true)),
      )
      .orderBy(asc(autoApprovalRules.priority));

    const history = await customerHistory(tx, user.id);
    const decision = evaluateAutoApproval({
      rules,
      booking: {
        totalDueCents: priced.totalDueCents,
        itemCount: priced.lines.reduce((s, l) => s + l.quantity, 0),
        days,
        noticeDays: Math.floor((startAt.getTime() - Date.now()) / 86_400_000),
        hasBondedItems: priced.bondTotalCents > 0,
      },
      customer: {
        customerTypeId: user.customerTypeId,
        customerTypeConfirmed: Boolean(user.customerTypeConfirmedAt),
        emailVerified: Boolean(user.emailVerifiedAt),
        ...history,
      },
      categoryIds: [...new Set(basket.map((b) => b.equipment.categoryId).filter(Boolean))],
      anyItemRequiresReview: basket.some((b) => b.equipment.alwaysRequiresReview),
    });

    let current = booking;
    if (decision.approved) {
      current = await transition(tx, {
        booking: current,
        to: 'APPROVED',
        actorKind: 'SYSTEM',
        reason: decision.reason,
        meta: { ruleId: decision.rule?.id ?? null },
        set: {
          approvedAt: now(),
          autoApproved: true,
          paymentDueAt: addHours(now(), settings['booking.paymentWindowHours'] ?? 72),
        },
      });
    }

    // (6) Emails, inside the transaction.
    const webUrl = await getAppUrl(org, 'web', tx);
    const adminUrl = await getAppUrl(org, 'admin', tx);
    const emailVars = await bookingEmailVariables(tx, { org, booking: current, user, webUrl });

    if (decision.approved) {
      await enqueueEmail(tx, {
        organisationId: org.id,
        templateCode: 'booking.approved',
        toEmail: user.email,
        toName: user.firstName,
        userId: user.id,
        bookingId: current.id,
        variables: {
          ...emailVars,
          paymentUrl: `${webUrl}/bookings/${current.reference}/pay`,
          paymentDueLabel: formatDateTime(current.paymentDueAt, org.timezone),
        },
      });
    } else {
      await enqueueEmail(tx, {
        organisationId: org.id,
        templateCode: 'booking.submitted',
        toEmail: user.email,
        toName: user.firstName,
        userId: user.id,
        bookingId: current.id,
        variables: emailVars,
      });

      for (const staff of await staffRecipients(
        org.id,
        'booking.approve',
        'staff.booking_submitted',
        tx,
      )) {
        await enqueueEmail(tx, {
          organisationId: org.id,
          templateCode: 'staff.booking_submitted',
          toEmail: staff.email,
          toName: staff.firstName,
          bookingId: current.id,
          variables: {
            ...emailVars,
            customer: { ...emailVars.customer, name: `${user.firstName} ${user.lastName}` },
            adminUrl: `${adminUrl}/bookings/${current.id}`,
          },
        });
      }
    }

    return { booking: current, decision, priced };
  });

  // Committed — now try to deliver. If this fails the tick picks it up.
  dispatchOutboxSoon();

  log.info(
    {
      bookingId: created.booking.id,
      reference: created.booking.reference,
      autoApproved: created.decision.approved,
    },
    'Booking created',
  );
  return created;
}

/** Past behaviour, used by the auto-approval rules. */
async function customerHistory(tx, userId) {
  const [row] = await tx
    .select({
      completedBookings: sql`count(*) filter (where ${bookings.status} = 'COMPLETED')::int`,
      overdueCount: sql`count(*) filter (where ${bookings.overdueNotifiedAt} is not null)::int`,
    })
    .from(bookings)
    .where(eq(bookings.userId, userId));
  return {
    completedBookings: row?.completedBookings ?? 0,
    overdueCount: row?.overdueCount ?? 0,
  };
}

/** Variables every booking email shares. */
async function bookingEmailVariables(tx, { org, booking, user, webUrl }) {
  const items = await tx
    .select({ name: bookingItems.nameSnapshot, quantity: bookingItems.quantity })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id));

  return {
    siteUrl: webUrl,
    customer: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    booking: {
      reference: booking.reference,
      pickupLabel: formatDateTime(booking.startAt, org.timezone),
      returnLabel: formatDateTime(booking.endAt, org.timezone),
      itemsLabel: items.map((i) => `${i.quantity} × ${i.name}`).join(', '),
      hireTotal: formatMoney(booking.hireSubtotalCents - booking.discountCents, org.currency),
      bondTotal: booking.bondTotalCents ? formatMoney(booking.bondTotalCents, org.currency) : '',
      totalDue: formatMoney(booking.totalDueCents, org.currency),
      url: `${webUrl}/account/bookings/${booking.reference}`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer views
// ─────────────────────────────────────────────────────────────────────────────

export async function listMyBookings({ user, query }) {
  const { limit, offset } = toLimitOffset(query);
  const where = and(
    eq(bookings.userId, user.id),
    query.status === 'ACTIVE'
      ? inArray(bookings.status, ['PENDING_REVIEW', 'APPROVED', 'CONFIRMED', 'PICKED_UP'])
      : query.status && query.status !== 'OVERDUE'
        ? eq(bookings.status, query.status)
        : undefined,
  );

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        totalDueCents: bookings.totalDueCents,
        bondTotalCents: bookings.bondTotalCents,
        paymentDueAt: bookings.paymentDueAt,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(where)
      .orderBy(desc(bookings.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(bookings).where(where),
  ]);

  const data = rows.map((b) => ({ ...b, status: effectiveStatus(b) }));
  return paginated(data, Number(total), query);
}

export async function getMyBooking({ org, user, reference }) {
  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.organisationId, org.id),
      eq(bookings.reference, reference),
      eq(bookings.userId, user.id),
    ),
    with: {
      items: true,
      statusHistory: { orderBy: (h, { asc: a }) => [a(h.createdAt)] },
      payments: true,
      refunds: true,
      answers: true,
      inspection: { with: { deductions: true } },
    },
  });
  if (!booking) throw notFound('That booking could not be found.');

  return {
    ...booking,
    status: effectiveStatus(booking),
    storedStatus: booking.status,
    canCancel: CUSTOMER_CANCELLABLE.has(booking.status) && effectiveStatus(booking) !== 'EXPIRED',
  };
}

export async function cancelMyBooking({ org, user, reference, reason }) {
  const settings = await getSettings(org.id);
  if (settings['booking.allowSelfCancellation'] === false) {
    throw forbidden('Please contact us to cancel a booking.');
  }

  const result = await db.transaction(async (tx) => {
    const [booking] = await tx
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
    if (!CUSTOMER_CANCELLABLE.has(booking.status)) {
      throw conflict(
        `A booking that is ${humanStatus(booking.status)} cannot be cancelled online.`,
      );
    }

    const tiers = await tx
      .select()
      .from(cancellationTiers)
      .where(
        and(eq(cancellationTiers.organisationId, org.id), eq(cancellationTiers.isActive, true)),
      );

    // Only money actually received is refundable.
    const paid = await paidTotals(tx, booking.id);
    const refund = cancellationRefund({
      tiers,
      startAt: booking.startAt,
      cancelledAt: now(),
      hirePaidCents: paid.hireCents,
      bondPaidCents: paid.bondCents,
    });

    const updated = await transition(tx, {
      booking,
      to: 'CANCELLED',
      actorUserId: user.id,
      actorKind: 'CUSTOMER',
      reason: reason ?? 'Cancelled by customer',
      meta: { refund },
      set: { cancelledAt: now(), cancelledBy: user.id, cancellationReason: reason ?? null },
    });

    if (refund.refundCents > 0) {
      // Queued, not called: Stripe must not be invoked inside a database
      // transaction — a slow API call would hold locks, and a successful
      // refund followed by a rollback would be unrecoverable.
      await queueRefund(tx, {
        organisationId: org.id,
        bookingId: booking.id,
        amountCents: refund.refundCents,
        reasonCode: 'CANCELLATION',
        reasonNote: refund.explanation,
        requestedBy: user.id,
      });
    }

    const webUrl = await getAppUrl(org, 'web', tx);
    await enqueueEmail(tx, {
      organisationId: org.id,
      templateCode: 'booking.cancelled',
      toEmail: user.email,
      toName: user.firstName,
      userId: user.id,
      bookingId: booking.id,
      variables: {
        ...(await bookingEmailVariables(tx, { org, booking: updated, user, webUrl })),
        refundLabel: refund.refundCents ? formatMoney(refund.refundCents, org.currency) : '',
        reason: reason ?? '',
      },
    });

    return { booking: updated, refund };
  });

  dispatchOutboxSoon();
  return result;
}

/** Money actually received, split between hire and bond. */
async function paidTotals(tx, bookingId) {
  const [row] = await tx
    .select({
      hireCents: sql`coalesce(sum(${payments.hireAmountCents}), 0)::int`,
      bondCents: sql`coalesce(sum(${payments.bondAmountCents}), 0)::int`,
      refundedCents: sql`coalesce(sum(${payments.refundedCents}), 0)::int`,
    })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'SUCCEEDED')));
  return {
    hireCents: row?.hireCents ?? 0,
    bondCents: row?.bondCents ?? 0,
    refundedCents: row?.refundedCents ?? 0,
  };
}

/** Insert a PENDING refund row; the tick sends it to Stripe. */
async function queueRefund(
  tx,
  { organisationId, bookingId, amountCents, reasonCode, reasonNote, requestedBy },
) {
  const [payment] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'SUCCEEDED')))
    .orderBy(desc(payments.paidAt))
    .limit(1);
  if (!payment) return null;

  const [row] = await tx
    .insert(refunds)
    .values({
      organisationId,
      paymentId: payment.id,
      bookingId,
      amountCents,
      reasonCode,
      reasonNote: reasonNote ?? null,
      requestedBy: requestedBy ?? null,
      status: 'PENDING',
    })
    .returning({ id: refunds.id });
  return row.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff views and decisions
// ─────────────────────────────────────────────────────────────────────────────

export async function listBookings({ org, query }) {
  const { limit, offset } = toLimitOffset(query);

  const filters = [eq(bookings.organisationId, org.id)];
  if (query.status === 'ACTIVE') {
    filters.push(
      inArray(bookings.status, ['PENDING_REVIEW', 'APPROVED', 'CONFIRMED', 'PICKED_UP']),
    );
  } else if (query.status === 'OVERDUE') {
    filters.push(eq(bookings.status, 'PICKED_UP'), lte(bookings.endAt, now()));
  } else if (query.status) {
    filters.push(eq(bookings.status, query.status));
  }
  if (query.customerId) filters.push(eq(bookings.userId, query.customerId));
  if (query.from) filters.push(gte(bookings.startAt, new Date(query.from)));
  if (query.to) filters.push(lte(bookings.startAt, new Date(`${query.to}T23:59:59`)));
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(bookings.reference, term),
        ilike(users.email, term),
        ilike(users.firstName, term),
        ilike(users.lastName, term),
        ilike(users.hirerOrgName, term),
      ),
    );
  }
  const where = and(...filters);

  const sortColumn =
    {
      createdAt: bookings.createdAt,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      totalDueCents: bookings.totalDueCents,
      reference: bookings.reference,
    }[query.sort?.column] ?? bookings.createdAt;
  const order = query.sort?.direction === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        totalDueCents: bookings.totalDueCents,
        bondTotalCents: bookings.bondTotalCents,
        paymentDueAt: bookings.paymentDueAt,
        autoApproved: bookings.autoApproved,
        createdAt: bookings.createdAt,
        customer: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          hirerOrgName: users.hirerOrgName,
        },
      })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId))
      .where(where),
  ]);

  return paginated(
    rows.map((b) => ({ ...b, status: effectiveStatus(b), storedStatus: b.status })),
    Number(total),
    query,
  );
}

export async function getBooking({ org, bookingId }) {
  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.organisationId, org.id), eq(bookings.id, bookingId)),
    // Exclude the password hash explicitly: `user: true` would ship it to the
    // admin panel along with the rest of the row.
    with: {
      user: { columns: { passwordHash: false } },
      items: { with: { equipment: true } },
      allocations: { with: { unit: true } },
      statusHistory: {
        with: { actor: { columns: { id: true, firstName: true, lastName: true } } },
        orderBy: (h, { asc: a }) => [a(h.createdAt)],
      },
      payments: true,
      refunds: true,
      answers: true,
      inspection: { with: { items: true, deductions: true } },
      pickupLocation: true,
      returnLocation: true,
    },
  });
  if (!booking) throw notFound('That booking could not be found.');
  return { ...booking, status: effectiveStatus(booking), storedStatus: booking.status };
}

export async function approveBooking({ org, bookingId, actor, input }) {
  const settings = await getSettings(org.id);

  const result = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.organisationId, org.id), eq(bookings.id, bookingId)))
      .limit(1);
    if (!booking) throw notFound('That booking could not be found.');

    const windowHours = input?.paymentWindowHours ?? settings['booking.paymentWindowHours'] ?? 72;
    // Never give a payment deadline after the hire has already started.
    const due = new Date(
      Math.min(addHours(now(), windowHours).getTime(), booking.startAt.getTime()),
    );

    const set = {
      approvedAt: now(),
      approvedBy: actor.userId,
      autoApproved: false,
      paymentDueAt: due,
      staffNotes: input?.staffNotes ?? booking.staffNotes,
    };

    // A goodwill discount re-derives the total; GST follows the discounted fee.
    if (input?.discountCents != null) {
      const discount = Math.min(input.discountCents, booking.hireSubtotalCents);
      set.discountCents = discount;
      set.gstCents = gstComponent(booking.hireSubtotalCents - discount, booking.taxRateBp);
      set.totalDueCents = booking.hireSubtotalCents - discount + booking.bondTotalCents;
    }

    const updated = await transition(tx, {
      booking,
      to: 'APPROVED',
      actorUserId: actor.userId,
      reason: 'Approved by staff',
      set,
    });

    const [customer] = await tx.select().from(users).where(eq(users.id, booking.userId)).limit(1);
    const webUrl = await getAppUrl(org, 'web', tx);
    await enqueueEmail(tx, {
      organisationId: org.id,
      templateCode: 'booking.approved',
      toEmail: customer.email,
      toName: customer.firstName,
      userId: customer.id,
      bookingId: booking.id,
      variables: {
        ...(await bookingEmailVariables(tx, { org, booking: updated, user: customer, webUrl })),
        paymentUrl: `${webUrl}/bookings/${updated.reference}/pay`,
        paymentDueLabel: formatDateTime(updated.paymentDueAt, org.timezone),
      },
    });

    return updated;
  });

  dispatchOutboxSoon();
  return result;
}

export async function rejectBooking({ org, bookingId, actor, reason }) {
  const result = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.organisationId, org.id), eq(bookings.id, bookingId)))
      .limit(1);
    if (!booking) throw notFound('That booking could not be found.');

    const updated = await transition(tx, {
      booking,
      to: 'REJECTED',
      actorUserId: actor.userId,
      reason,
      set: { rejectedAt: now(), rejectionReason: reason },
    });

    const [customer] = await tx.select().from(users).where(eq(users.id, booking.userId)).limit(1);
    const webUrl = await getAppUrl(org, 'web', tx);
    await enqueueEmail(tx, {
      organisationId: org.id,
      templateCode: 'booking.rejected',
      toEmail: customer.email,
      toName: customer.firstName,
      userId: customer.id,
      bookingId: booking.id,
      variables: {
        ...(await bookingEmailVariables(tx, { org, booking: updated, user: customer, webUrl })),
        reason,
      },
    });

    return updated;
  });

  dispatchOutboxSoon();
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-based reconciliation, driven by the hourly tick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expire approvals that were never paid for.
 *
 * Idempotent: it selects only APPROVED bookings already past their deadline,
 * so running it twice in an hour, or missing an hour, changes nothing.
 */
export async function expireUnpaidApprovals() {
  const due = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, 'APPROVED'), lte(bookings.paymentDueAt, now())))
    .limit(200);

  let expired = 0;
  for (const booking of due) {
    try {
      await db.transaction(async (tx) => {
        const updated = await transition(tx, {
          booking,
          to: 'EXPIRED',
          actorKind: 'SYSTEM',
          reason: 'Payment not received before the deadline',
        });
        const [customer] = await tx
          .select()
          .from(users)
          .where(eq(users.id, booking.userId))
          .limit(1);
        const [org] = await tx
          .select()
          .from(organisations)
          .where(eq(organisations.id, booking.organisationId))
          .limit(1);
        const webUrl = await getAppUrl(org, 'web', tx);
        await enqueueEmail(tx, {
          organisationId: booking.organisationId,
          templateCode: 'booking.expired',
          toEmail: customer.email,
          toName: customer.firstName,
          userId: customer.id,
          bookingId: booking.id,
          variables: await bookingEmailVariables(tx, {
            org,
            booking: updated,
            user: customer,
            webUrl,
          }),
        });
      });
      expired += 1;
    } catch (err) {
      // One bad booking must not stop the rest of the batch.
      log.error({ err, bookingId: booking.id }, 'Failed to expire booking');
    }
  }
  if (expired) log.info({ expired }, 'Expired unpaid approvals');
  return { expired };
}

/** Notify about overdue returns, once per booking. */
export async function flagOverdueReturns() {
  const overdue = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'PICKED_UP'),
        lte(bookings.endAt, now()),
        isNull(bookings.overdueNotifiedAt),
      ),
    )
    .limit(200);

  let notified = 0;
  for (const booking of overdue) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(bookings)
          .set({ overdueNotifiedAt: now() })
          .where(and(eq(bookings.id, booking.id), isNull(bookings.overdueNotifiedAt)));

        const [customer] = await tx
          .select()
          .from(users)
          .where(eq(users.id, booking.userId))
          .limit(1);
        const [org] = await tx
          .select()
          .from(organisations)
          .where(eq(organisations.id, booking.organisationId))
          .limit(1);
        const settings = await getSettings(org.id, tx);
        const webUrl = await getAppUrl(org, 'web', tx);
        const lateFee = settings['booking.lateFeePerDayCents'] ?? 0;

        await enqueueEmail(tx, {
          organisationId: booking.organisationId,
          templateCode: 'booking.overdue',
          toEmail: customer.email,
          toName: customer.firstName,
          userId: customer.id,
          bookingId: booking.id,
          variables: {
            ...(await bookingEmailVariables(tx, { org, booking, user: customer, webUrl })),
            lateFeeLabel: lateFee ? `${formatMoney(lateFee, org.currency)} per day` : '',
          },
        });
      });
      notified += 1;
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to flag overdue booking');
    }
  }
  if (notified) log.info({ notified }, 'Flagged overdue returns');
  return { notified };
}
