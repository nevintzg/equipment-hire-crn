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
import { citext, fk, pk, timestamps } from './_shared.js';
import { bookingStatusEnum, bookingUnitEnum, questionTypeEnum } from './enums.js';
import { equipment } from './catalogue.js';
import { availabilityBlocks, equipmentUnits, locationSlots, locations } from './inventory.js';
import { customerTypes, organisations, users } from './identity.js';

/**
 * Bookings.
 *
 * One booking has one date range and many items (the basket model the client
 * asked for: a marquee, eight tables and a PA for the same weekend is one
 * request, one approval, one payment).
 *
 * Prices are copied onto booking_items at submission time. Resolving them
 * live would mean a customer's invoice silently changed when staff edited the
 * price list, which is both confusing and, for a community organisation
 * issuing tax invoices, wrong.
 */

export const bookings = pgTable(
  'bookings',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** Human-quotable, e.g. BK-7KQ4M2. Unique per organisation. */
    reference: citext('reference').notNull(),
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    status: bookingStatusEnum('status').notNull().default('PENDING_REVIEW'),
    /**
     * Optimistic concurrency guard. Every status change asserts the version it
     * read and bumps it, so two staff approving at once cannot both win.
     */
    version: integer('version').notNull().default(1),

    /** Exact instants, always UTC. */
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    bookingUnit: bookingUnitEnum('booking_unit').notNull().default('DAY'),
    /** Chargeable units (days), computed in the org timezone at submission. */
    chargeableUnits: integer('chargeable_units').notNull().default(1),

    pickupLocationId: fk('pickup_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    returnLocationId: fk('return_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    pickupSlotId: fk('pickup_slot_id').references(() => locationSlots.id, {
      onDelete: 'set null',
    }),
    returnSlotId: fk('return_slot_id').references(() => locationSlots.id, {
      onDelete: 'set null',
    }),

    /** Snapshot of the customer type that priced this booking. */
    customerTypeId: fk('customer_type_id').references(() => customerTypes.id, {
      onDelete: 'set null',
    }),

    /** Money, all GST-inclusive integer cents. */
    hireSubtotalCents: integer('hire_subtotal_cents').notNull().default(0),
    bondTotalCents: integer('bond_total_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    adjustmentCents: integer('adjustment_cents').notNull().default(0),
    totalDueCents: integer('total_due_cents').notNull().default(0),
    /** GST component of the hire fee, computed once at submission. */
    gstCents: integer('gst_cents').notNull().default(0),
    taxRateBp: integer('tax_rate_bp').notNull().default(1000),

    purpose: text('purpose'), // "school fete", "community BBQ"
    expectedAttendees: integer('expected_attendees'),
    deliveryRequired: boolean('delivery_required').notNull().default(false),
    deliveryAddress: text('delivery_address'),
    customerNotes: text('customer_notes'),
    staffNotes: text('staff_notes'),

    termsVersionId: fk('terms_version_id'),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Set by auto-approval or by a staff decision. */
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: fk('approved_by').references(() => users.id, { onDelete: 'set null' }),
    autoApproved: boolean('auto_approved').notNull().default(false),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    /** Approval lapses if payment is not made by this time. */
    paymentDueAt: timestamp('payment_due_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: fk('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
    cancellationReason: text('cancellation_reason'),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    pickedUpBy: fk('picked_up_by').references(() => users.id, { onDelete: 'set null' }),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    returnedTo: fk('returned_to').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    /**
     * Overdue is a flag on a PICKED_UP booking, not a status: the booking is
     * still legitimately out, it is just late. Making it a status would mean
     * losing the information that it had been picked up.
     */
    overdueNotifiedAt: timestamp('overdue_notified_at', { withTimezone: true }),
    lateFeeCents: integer('late_fee_cents').notNull().default(0),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('bookings_org_reference_uq').on(t.organisationId, t.reference),
    index('bookings_org_status_idx').on(t.organisationId, t.status),
    index('bookings_user_idx').on(t.userId, t.createdAt),
    index('bookings_window_idx').on(t.organisationId, t.startAt, t.endAt),
    index('bookings_payment_due_idx').on(t.paymentDueAt),
  ],
);

export const bookingItems = pgTable(
  'booking_items',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(1),

    /** Snapshots — what the customer saw and agreed to. */
    nameSnapshot: text('name_snapshot').notNull(),
    unitRateCents: integer('unit_rate_cents').notNull().default(0),
    ratePeriodSnapshot: varchar('rate_period_snapshot', { length: 32 })
      .notNull()
      .default('PER_DAY'),
    lineHireCents: integer('line_hire_cents').notNull().default(0),
    lineBondCents: integer('line_bond_cents').notNull().default(0),
    /** How the rate was arrived at, for staff answering "why this price?". */
    priceBreakdown: jsonb('price_breakdown').$type(/** @type {Record<string, unknown>} */ ({})),

    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [
    index('booking_items_booking_idx').on(t.bookingId),
    index('booking_items_equipment_idx').on(t.equipmentId),
  ],
);

/**
 * Which physical unit satisfies which line.
 *
 * Allocation is deferred for SERIALIZED items: a customer books "a marquee",
 * and the system picks unit #3. Keeping that in its own table means staff can
 * swap a unit (one develops a tear) without touching the booking's money.
 */
export const bookingAllocations = pgTable(
  'booking_allocations',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    bookingItemId: fk('booking_item_id')
      .notNull()
      .references(() => bookingItems.id, { onDelete: 'cascade' }),
    unitId: fk('unit_id')
      .notNull()
      .references(() => equipmentUnits.id, { onDelete: 'restrict' }),
    /** The block this allocation created, so release is a single update. */
    availabilityBlockId: fk('availability_block_id').references(() => availabilityBlocks.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    index('booking_allocations_booking_idx').on(t.bookingId),
    index('booking_allocations_unit_idx').on(t.unitId),
  ],
);

/** Append-only. Who changed what, when, and why — the audit the client needs. */
export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    fromStatus: bookingStatusEnum('from_status'),
    toStatus: bookingStatusEnum('to_status').notNull(),
    /** Null when the change was made by the system (cron, webhook). */
    actorUserId: fk('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorKind: varchar('actor_kind', { length: 16 }).notNull().default('USER'),
    reason: text('reason'),
    meta: jsonb('meta').$type(/** @type {Record<string, unknown>} */ ({})),
    ...timestamps(),
  },
  (t) => [index('booking_status_history_booking_idx').on(t.bookingId, t.createdAt)],
);

/** Configurable questions asked at checkout, per organisation. */
export const bookingQuestions = pgTable(
  'booking_questions',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    code: citext('code').notNull(),
    label: text('label').notNull(),
    helpText: text('help_text'),
    type: questionTypeEnum('type').notNull().default('TEXT'),
    options: jsonb('options').$type(/** @type {string[]} */ ([])),
    isRequired: boolean('is_required').notNull().default(false),
    /** Only ask when the basket contains this category. */
    categoryId: fk('category_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('booking_questions_org_code_uq').on(t.organisationId, t.code)],
);

export const bookingAnswers = pgTable(
  'booking_answers',
  {
    id: pk(),
    bookingId: fk('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    questionId: fk('question_id')
      .notNull()
      .references(() => bookingQuestions.id, { onDelete: 'restrict' }),
    /** Label snapshot so an edited question does not rewrite history. */
    labelSnapshot: text('label_snapshot').notNull(),
    answer: text('answer'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('booking_answers_uq').on(t.bookingId, t.questionId)],
);

/**
 * Versioned terms and conditions. A booking points at the exact version the
 * customer ticked, which is the only way to answer "what did they agree to?"
 * a year later.
 */
export const termsVersions = pgTable(
  'terms_versions',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    /** Exactly one current version per org — partial unique index in 0002. */
    isCurrent: boolean('is_current').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('terms_versions_org_version_uq').on(t.organisationId, t.version)],
);
