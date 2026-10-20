import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { fk, pk, timestamps } from './_shared.js';
import {
  conditionEnum,
  paymentMethodEnum,
  paymentPurposeEnum,
  paymentStatusEnum,
  refundStatusEnum,
} from './enums.js';
import { bookingItems, bookings } from './bookings.js';
import { equipmentUnits } from './inventory.js';
import { files } from './catalogue.js';
import { organisations, users } from './identity.js';

/**
 * Money in, money out, and the return inspection that decides how much bond
 * goes back.
 *
 * Hire fee and bond are charged together, once, after approval. The obvious
 * alternative — authorise the bond and capture only if damaged — does not
 * survive contact with reality: a card authorisation expires in about seven
 * days, and community bookings are routinely made months ahead. So the bond
 * is taken as a real payment and refunded after inspection.
 */

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    purpose: paymentPurposeEnum('purpose').notNull().default('HIRE_AND_BOND'),
    method: paymentMethodEnum('method').notNull().default('STRIPE_CARD'),
    status: paymentStatusEnum('status').notNull().default('REQUIRES_PAYMENT'),

    /** Split recorded so refunds can target the bond without maths later. */
    hireAmountCents: integer('hire_amount_cents').notNull().default(0),
    bondAmountCents: integer('bond_amount_cents').notNull().default(0),
    amountCents: integer('amount_cents').notNull(),
    refundedCents: integer('refunded_cents').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('AUD'),

    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeChargeId: text('stripe_charge_id'),
    /** Sent to Stripe so a retried request cannot double-charge. */
    idempotencyKey: text('idempotency_key'),

    /** Manual methods: what staff typed when reconciling. */
    manualReference: text('manual_reference'),
    recordedBy: fk('recorded_by').references(() => users.id, { onDelete: 'set null' }),

    paidAt: timestamp('paid_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    ...timestamps(),
  },
  (t) => [
    index('payments_booking_idx').on(t.bookingId),
    index('payments_org_status_idx').on(t.organisationId, t.status),
    uniqueIndex('payments_checkout_session_uq').on(t.stripeCheckoutSessionId),
    uniqueIndex('payments_idempotency_uq').on(t.idempotencyKey),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    paymentId: fk('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    status: refundStatusEnum('status').notNull().default('PENDING'),
    /** BOND_RETURN | CANCELLATION | GOODWILL | OVERPAYMENT */
    reasonCode: varchar('reason_code', { length: 32 }).notNull(),
    reasonNote: text('reason_note'),
    stripeRefundId: text('stripe_refund_id'),
    requestedBy: fk('requested_by').references(() => users.id, { onDelete: 'set null' }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    ...timestamps(),
  },
  (t) => [
    index('refunds_booking_idx').on(t.bookingId),
    index('refunds_status_idx').on(t.organisationId, t.status),
    uniqueIndex('refunds_stripe_refund_uq').on(t.stripeRefundId),
  ],
);

/** The return check that releases or withholds the bond. */
export const inspections = pgTable(
  'inspections',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    inspectedBy: fk('inspected_by').references(() => users.id, { onDelete: 'set null' }),
    inspectedAt: timestamp('inspected_at', { withTimezone: true }),
    allItemsReturned: boolean('all_items_returned').notNull().default(true),
    /** Totals, derived from inspection_items but stored for reporting. */
    totalDeductionCents: integer('total_deduction_cents').notNull().default(0),
    bondRefundCents: integer('bond_refund_cents').notNull().default(0),
    summary: text('summary'),
    /** Nothing is refunded until a staff member signs the inspection off. */
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
    signedOffBy: fk('signed_off_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('inspections_booking_uq').on(t.bookingId)],
);

export const inspectionItems = pgTable(
  'inspection_items',
  {
    id: pk(),
    inspectionId: fk('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    bookingItemId: fk('booking_item_id')
      .notNull()
      .references(() => bookingItems.id, { onDelete: 'cascade' }),
    unitId: fk('unit_id').references(() => equipmentUnits.id, { onDelete: 'set null' }),
    quantityReturned: integer('quantity_returned').notNull().default(0),
    quantityMissing: integer('quantity_missing').notNull().default(0),
    conditionOnReturn: conditionEnum('condition_on_return').notNull().default('GOOD'),
    isDamaged: boolean('is_damaged').notNull().default(false),
    isCleaningRequired: boolean('is_cleaning_required').notNull().default(false),
    notes: text('notes'),
    photoFileId: fk('photo_file_id').references(() => files.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('inspection_items_inspection_idx').on(t.inspectionId)],
);

/** Each itemised reason the customer is not getting the full bond back. */
export const bondDeductions = pgTable(
  'bond_deductions',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    inspectionId: fk('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    inspectionItemId: fk('inspection_item_id').references(() => inspectionItems.id, {
      onDelete: 'set null',
    }),
    /** DAMAGE | MISSING | CLEANING | LATE_RETURN | OTHER */
    kind: varchar('kind', { length: 32 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    /** Shown on the customer's statement; disputes reference it. */
    isDisputed: boolean('is_disputed').notNull().default(false),
    disputeNote: text('dispute_note'),
    createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('bond_deductions_booking_idx').on(t.bookingId)],
);

/**
 * Every Stripe event this API has processed.
 *
 * Stripe guarantees at-least-once delivery, so the same event will arrive
 * twice. Inserting the event id first, inside the handler's transaction, makes
 * replay a no-op: the unique constraint rejects the duplicate and the handler
 * returns 200 without doing the work again.
 */
export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: pk(),
    organisationId: fk('organisation_id').references(() => organisations.id, {
      onDelete: 'set null',
    }),
    stripeEventId: text('stripe_event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type(/** @type {Record<string, unknown>} */ ({})),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('stripe_events_event_id_uq').on(t.stripeEventId)],
);
