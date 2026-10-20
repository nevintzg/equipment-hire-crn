import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { citext, fk, pk, timestamps, tstzrange } from './_shared.js';
import {
  blockReasonEnum,
  conditionEnum,
  stockAdjustmentReasonEnum,
  unitStatusEnum,
} from './enums.js';
import { equipment, files } from './catalogue.js';
import { organisations, users } from './identity.js';

/**
 * Physical stock and when it is unavailable.
 *
 * availability_blocks is the heart of the system. Every reason a thing cannot
 * be hired — an existing booking, a service, a public holiday closure — is one
 * row with a time range. Availability is then a single question ("does any
 * active block overlap the requested range?") instead of four different
 * queries that can disagree with each other.
 */

export const locations = pgTable(
  'locations',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    suburb: text('suburb'),
    state: varchar('state', { length: 10 }),
    postcode: varchar('postcode', { length: 10 }),
    /** Decimal degrees, stored as text to avoid float comparison surprises. */
    latitude: text('latitude'),
    longitude: text('longitude'),
    accessNotes: text('access_notes'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('locations_org_idx').on(t.organisationId)],
);

/**
 * Pickup and return windows, e.g. "Saturday 09:00–11:00".
 * Bookings must choose a slot, which is what stops a volunteer-run shed from
 * being asked to hand over a marquee at 3am.
 */
export const locationSlots = pgTable(
  'location_slots',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    locationId: fk('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    /** 0 = Sunday … 6 = Saturday, matching JS getDay(). */
    weekday: integer('weekday').notNull(),
    /** Local wall-clock time in the organisation's timezone, 'HH:MM'. */
    startTime: varchar('start_time', { length: 5 }).notNull(),
    endTime: varchar('end_time', { length: 5 }).notNull(),
    /** PICKUP | RETURN | BOTH */
    kind: varchar('kind', { length: 16 }).notNull().default('BOTH'),
    /** Cap on how many handovers can be booked in this slot. */
    capacity: integer('capacity'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('location_slots_location_idx').on(t.locationId, t.weekday)],
);

/** One physically identifiable thing. Only used by SERIALIZED equipment. */
export const equipmentUnits = pgTable(
  'equipment_units',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    /** Asset tag staff write on the item itself. */
    assetTag: citext('asset_tag').notNull(),
    serialNumber: text('serial_number'),
    locationId: fk('location_id').references(() => locations.id, { onDelete: 'set null' }),
    status: unitStatusEnum('status').notNull().default('AVAILABLE'),
    condition: conditionEnum('condition').notNull().default('GOOD'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }),
    purchaseCostCents: integer('purchase_cost_cents'),
    lastServicedAt: timestamp('last_serviced_at', { withTimezone: true }),
    nextServiceDueAt: timestamp('next_service_due_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('equipment_units_org_asset_tag_uq').on(t.organisationId, t.assetTag),
    index('equipment_units_equipment_status_idx').on(t.equipmentId, t.status),
  ],
);

/**
 * Every period in which stock is not available, whatever the reason.
 *
 * `period` is a half-open tstzrange. For SERIALIZED stock, unit_id is set and
 * a GiST exclusion constraint (drizzle/0002_integrity.sql) makes two
 * overlapping active blocks for one unit physically impossible to insert —
 * double-booking is prevented by Postgres, not by application checks that can
 * lose a race. For BULK stock, unit_id is null, quantity carries the count,
 * and the service takes a row lock on the equipment row before summing.
 */
export const availabilityBlocks = pgTable(
  'availability_blocks',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    unitId: fk('unit_id').references(() => equipmentUnits.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    period: tstzrange('period').notNull(),
    reason: blockReasonEnum('reason').notNull(),
    /** Set when reason = BOOKING. Deliberately not a hard FK to keep this
     * table insertable before the booking row is committed in edge cases;
     * the FK is added in 0002_integrity.sql once ordering is guaranteed. */
    bookingId: fk('booking_id'),
    maintenanceRecordId: fk('maintenance_record_id'),
    note: text('note'),
    /**
     * Soft release. Cancelling a booking sets is_active = false rather than
     * deleting, so the history of what was held and when survives for audit.
     * The exclusion constraint only considers active rows.
     */
    isActive: boolean('is_active').notNull().default(true),
    createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    index('availability_blocks_equipment_idx').on(t.equipmentId, t.isActive),
    index('availability_blocks_booking_idx').on(t.bookingId),
    index('availability_blocks_unit_idx').on(t.unitId, t.isActive),
  ],
);

export const maintenanceRecords = pgTable(
  'maintenance_records',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    unitId: fk('unit_id').references(() => equipmentUnits.id, { onDelete: 'cascade' }),
    /** SERVICE | REPAIR | INSPECTION | CLEANING | TEST_AND_TAG */
    kind: varchar('kind', { length: 32 }).notNull().default('SERVICE'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Takes the unit out of service for this window. */
    takesOutOfService: boolean('takes_out_of_service').notNull().default(true),
    costCents: integer('cost_cents'),
    performedBy: text('performed_by'),
    description: text('description').notNull(),
    outcome: text('outcome'),
    createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    index('maintenance_records_equipment_idx').on(t.equipmentId),
    index('maintenance_records_unit_idx').on(t.unitId),
  ],
);

/** Condition at a point in time, with photos. Drives damage disputes. */
export const conditionLogs = pgTable(
  'condition_logs',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    unitId: fk('unit_id').references(() => equipmentUnits.id, { onDelete: 'cascade' }),
    bookingId: fk('booking_id'),
    /** PICKUP | RETURN | AUDIT | MAINTENANCE */
    context: varchar('context', { length: 32 }).notNull(),
    condition: conditionEnum('condition').notNull(),
    notes: text('notes'),
    photoFileId: fk('photo_file_id').references(() => files.id, { onDelete: 'set null' }),
    recordedBy: fk('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    index('condition_logs_unit_idx').on(t.unitId),
    index('condition_logs_booking_idx').on(t.bookingId),
  ],
);

/** Append-only ledger of BULK quantity changes, so counts are explainable. */
export const stockAdjustments = pgTable(
  'stock_adjustments',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    /** Signed: +50 donation, -2 written off. */
    delta: integer('delta').notNull(),
    reason: stockAdjustmentReasonEnum('reason').notNull(),
    note: text('note'),
    createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('stock_adjustments_equipment_idx').on(t.equipmentId, t.createdAt)],
);
