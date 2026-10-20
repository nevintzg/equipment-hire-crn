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
import { citext, fk, pk, timestamps, deletedAt } from './_shared.js';
import {
  attributeTypeEnum,
  bookingUnitEnum,
  equipmentStatusEnum,
  inventoryModeEnum,
  mediaKindEnum,
  pricePeriodEnum,
  priceTierKindEnum,
} from './enums.js';
import { customerTypes, organisations, users } from './identity.js';

/**
 * What the organisation hires out, how it is described, and what it costs.
 *
 * The attribute system exists because the client's inventory is genuinely
 * heterogeneous — a marquee has a footprint, a PA has channels, a BBQ has a
 * gas bottle size. Hard-coding columns for each would mean a schema migration
 * every time staff add a new kind of gear, so attributes are configurable
 * rows and the admin UI renders whatever is defined.
 */

export const categories = pgTable(
  'categories',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    parentId: fk('parent_id'),
    slug: citext('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageFileId: fk('image_file_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('categories_org_slug_uq').on(t.organisationId, t.slug),
    index('categories_parent_idx').on(t.parentId),
  ],
);

/** Uploaded objects. Bytes live in S3/R2; this table is the metadata. */
export const files = pgTable(
  'files',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** Null until the browser confirms the presigned PUT succeeded. */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    uploadedBy: fk('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('files_storage_key_uq').on(t.storageKey),
    index('files_org_idx').on(t.organisationId),
  ],
);

export const attributeDefinitions = pgTable(
  'attribute_definitions',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    code: citext('code').notNull(),
    label: text('label').notNull(),
    type: attributeTypeEnum('type').notNull(),
    unitLabel: text('unit_label'), // "m", "kg", "seats"
    /** Allowed values for SELECT / MULTI_SELECT. */
    options: jsonb('options').$type(/** @type {string[]} */ ([])),
    /** Offer this attribute as a filter on the public catalogue. */
    isFilterable: boolean('is_filterable').notNull().default(false),
    showOnCard: boolean('show_on_card').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('attribute_definitions_org_code_uq').on(t.organisationId, t.code)],
);

/** Which attributes apply to which category, and whether they are mandatory. */
export const categoryAttributes = pgTable(
  'category_attributes',
  {
    categoryId: fk('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    attributeDefinitionId: fk('attribute_definition_id')
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
    isRequired: boolean('is_required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('category_attributes_pk').on(t.categoryId, t.attributeDefinitionId)],
);

export const equipment = pgTable(
  'equipment',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    categoryId: fk('category_id').references(() => categories.id, { onDelete: 'set null' }),
    slug: citext('slug').notNull(),
    name: text('name').notNull(),
    /** Staff-facing short code used on labels and pick lists. */
    sku: citext('sku'),
    summary: text('summary'),
    description: text('description'), // long form, rendered as Markdown
    status: equipmentStatusEnum('status').notNull().default('DRAFT'),

    inventoryMode: inventoryModeEnum('inventory_mode').notNull().default('SERIALIZED'),
    /**
     * Pool size for BULK items. Ignored for SERIALIZED, where capacity is the
     * number of active rows in equipment_units.
     */
    bulkQuantity: integer('bulk_quantity').notNull().default(0),

    bookingUnit: bookingUnitEnum('booking_unit').notNull().default('DAY'),
    minHireUnits: integer('min_hire_units').notNull().default(1),
    maxHireUnits: integer('max_hire_units'),
    /** Buffer between hires, for cleaning/charging/drying. */
    turnaroundHours: integer('turnaround_hours').notNull().default(0),
    /** Earliest a booking may start, in days from today. */
    minNoticeDays: integer('min_notice_days').notNull().default(1),
    /** Furthest ahead a booking may be made. */
    maxAdvanceDays: integer('max_advance_days').notNull().default(365),
    /** Per-booking cap, independent of availability. */
    maxPerBooking: integer('max_per_booking'),

    bondCents: integer('bond_cents').notNull().default(0),
    /** Replacement value, for insurance reporting and damage assessment. */
    replacementValueCents: integer('replacement_value_cents'),

    /** Hard requirements shown prominently before adding to the basket. */
    requiresLicence: boolean('requires_licence').notNull().default(false),
    requiresTowing: boolean('requires_towing').notNull().default(false),
    requiresInduction: boolean('requires_induction').notNull().default(false),
    /** Staff must review every booking containing this item. */
    alwaysRequiresReview: boolean('always_requires_review').notNull().default(false),

    weightKg: integer('weight_kg'),
    dimensions: text('dimensions'),
    safetyNotes: text('safety_notes'),
    includedItems: text('included_items'),
    pickupInstructions: text('pickup_instructions'),

    viewCount: integer('view_count').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('equipment_org_slug_uq').on(t.organisationId, t.slug),
    index('equipment_org_status_idx').on(t.organisationId, t.status),
    index('equipment_category_idx').on(t.categoryId),
  ],
);

export const equipmentAttributeValues = pgTable(
  'equipment_attribute_values',
  {
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    attributeDefinitionId: fk('attribute_definition_id')
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
    /** One column per shape keeps filtering indexable, unlike a single jsonb. */
    valueText: text('value_text'),
    valueNumber: integer('value_number'),
    valueBool: boolean('value_bool'),
    valueOptions: jsonb('value_options').$type(/** @type {string[]} */ ([])),
  },
  (t) => [
    uniqueIndex('equipment_attribute_values_pk').on(t.equipmentId, t.attributeDefinitionId),
    index('equipment_attribute_values_attr_idx').on(t.attributeDefinitionId),
  ],
);

/**
 * Rates.
 *
 * A BASE row is the public price. A CUSTOMER_TYPE row overrides it for a
 * confirmed customer type — this is how "free for residents, $40 for
 * businesses" is expressed without code changes. Rate resolution is pure and
 * unit-tested in modules/pricing/pricing.js.
 */
export const equipmentPrices = pgTable(
  'equipment_prices',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    tierKind: priceTierKindEnum('tier_kind').notNull().default('BASE'),
    customerTypeId: fk('customer_type_id').references(() => customerTypes.id, {
      onDelete: 'cascade',
    }),
    period: pricePeriodEnum('period').notNull().default('PER_DAY'),
    /** GST-inclusive, in cents. Zero is valid — plenty of gear is free. */
    amountCents: integer('amount_cents').notNull().default(0),
    /** Applies from this many units onward, for tapering multi-day rates. */
    fromUnit: integer('from_unit').notNull().default(1),
    /** Cap the charge no matter the duration. */
    maxChargeCents: integer('max_charge_cents'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    index('equipment_prices_equipment_idx').on(t.equipmentId, t.isActive),
    uniqueIndex('equipment_prices_tier_uq').on(
      t.equipmentId,
      t.tierKind,
      t.customerTypeId,
      t.period,
      t.fromUnit,
    ),
  ],
);

export const equipmentMedia = pgTable(
  'equipment_media',
  {
    id: pk(),
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    fileId: fk('file_id').references(() => files.id, { onDelete: 'cascade' }),
    kind: mediaKindEnum('kind').notNull().default('IMAGE'),
    /** For VIDEO_URL, where no file is stored. */
    externalUrl: text('external_url'),
    altText: text('alt_text'),
    caption: text('caption'),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('equipment_media_equipment_idx').on(t.equipmentId, t.sortOrder)],
);

/** "People also hire" — staff-curated, both directions inserted explicitly. */
export const relatedEquipment = pgTable(
  'related_equipment',
  {
    equipmentId: fk('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    relatedEquipmentId: fk('related_equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    /** SUGGESTED | REQUIRED_ACCESSORY */
    relation: varchar('relation', { length: 32 }).notNull().default('SUGGESTED'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('related_equipment_pk').on(t.equipmentId, t.relatedEquipmentId)],
);
