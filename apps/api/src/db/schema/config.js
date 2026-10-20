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
import { exportStatusEnum, outboxStatusEnum, pageStatusEnum, settingTypeEnum } from './enums.js';
import { categories, files } from './catalogue.js';
import { customerTypes, organisations, users } from './identity.js';
import { bookings } from './bookings.js';

/**
 * Everything that makes the product "configurable rather than rebuilt".
 *
 * The client's brief is one platform that any community organisation can take
 * and make its own. So branding, copy, pages, navigation, email wording,
 * cancellation rules and auto-approval rules are all rows, editable by a
 * non-technical administrator — not constants in the source.
 */

export const settings = pgTable(
  'settings',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** Dotted key, e.g. branding.primaryColour, booking.paymentWindowHours. */
    key: citext('key').notNull(),
    group: varchar('group', { length: 32 }).notNull(),
    type: settingTypeEnum('type').notNull().default('STRING'),
    value: jsonb('value'),
    /** Readable without authentication (branding, opening hours). */
    isPublic: boolean('is_public').notNull().default(false),
    updatedBy: fk('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('settings_org_key_uq').on(t.organisationId, t.key),
    index('settings_org_group_idx').on(t.organisationId, t.group),
  ],
);

/**
 * Refund schedule by notice given, e.g. 100% beyond 7 days, 50% beyond 48
 * hours, nothing after that. Evaluated by a pure function so the team can
 * unit-test the policy without a database.
 */
export const cancellationTiers = pgTable(
  'cancellation_tiers',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** Applies when the customer cancels at least this many hours ahead. */
    minHoursBefore: integer('min_hours_before').notNull(),
    refundPercent: integer('refund_percent').notNull(),
    /** Administration fee kept regardless of the percentage. */
    feeCents: integer('fee_cents').notNull().default(0),
    label: text('label').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('cancellation_tiers_org_hours_uq').on(t.organisationId, t.minHoursBefore)],
);

/**
 * Rules that let a booking skip manual review. Conditions are a small,
 * validated JSON document (see settings.schemas.js) rather than free-form
 * code, so a volunteer administrator cannot break the booking flow.
 */
export const autoApprovalRules = pgTable(
  'auto_approval_rules',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Lowest priority number wins. */
    priority: integer('priority').notNull().default(100),
    customerTypeId: fk('customer_type_id').references(() => customerTypes.id, {
      onDelete: 'cascade',
    }),
    categoryId: fk('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    conditions: jsonb('conditions')
      .notNull()
      .$type(/** @type {Record<string, unknown>} */ ({}))
      .default({}),
    /** false = force manual review (an explicit deny rule). */
    approve: boolean('approve').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('auto_approval_rules_org_idx').on(t.organisationId, t.priority)],
);

/** Editable CMS pages: About, Terms of hire, Contact, FAQ. */
export const pages = pgTable(
  'pages',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    slug: citext('slug').notNull(),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull().default(''),
    status: pageStatusEnum('status').notNull().default('DRAFT'),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    /** System pages cannot be deleted, only edited. */
    isSystem: boolean('is_system').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedBy: fk('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('pages_org_slug_uq').on(t.organisationId, t.slug)],
);

/** Ordered blocks that compose the home page. */
export const homeSections = pgTable(
  'home_sections',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** HERO | CATEGORY_GRID | FEATURED_EQUIPMENT | RICH_TEXT | STEPS | CTA | FAQ */
    kind: varchar('kind', { length: 32 }).notNull(),
    heading: text('heading'),
    subheading: text('subheading'),
    bodyMarkdown: text('body_markdown'),
    imageFileId: fk('image_file_id').references(() => files.id, { onDelete: 'set null' }),
    ctaLabel: text('cta_label'),
    ctaHref: text('cta_href'),
    /** Block-specific configuration, e.g. which equipment ids to feature. */
    config: jsonb('config').$type(/** @type {Record<string, unknown>} */ ({})),
    sortOrder: integer('sort_order').notNull().default(0),
    isVisible: boolean('is_visible').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('home_sections_org_idx').on(t.organisationId, t.sortOrder)],
);

export const navItems = pgTable(
  'nav_items',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    /** HEADER | FOOTER */
    placement: varchar('placement', { length: 16 }).notNull().default('HEADER'),
    label: text('label').notNull(),
    href: text('href').notNull(),
    parentId: fk('parent_id'),
    opensInNewTab: boolean('opens_in_new_tab').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    isVisible: boolean('is_visible').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('nav_items_org_placement_idx').on(t.organisationId, t.placement, t.sortOrder)],
);

/** Time-boxed site-wide banner: "Closed for the long weekend". */
export const announcements = pgTable(
  'announcements',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    /** INFO | WARNING | URGENT */
    level: varchar('level', { length: 16 }).notNull().default('INFO'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isDismissible: boolean('is_dismissible').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('announcements_org_active_idx').on(t.organisationId, t.isActive)],
);

/**
 * Handlebars templates, editable by staff. Seeded with sensible defaults
 * (modules/notifications/default-templates.js) so the system works out of the
 * box, but an organisation can rewrite every word in its own voice.
 */
export const emailTemplates = pgTable(
  'email_templates',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    code: citext('code').notNull(), // booking.submitted, booking.approved, …
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    /** Documents the variables available, rendered as help in the editor. */
    availableVariables: jsonb('available_variables').$type(/** @type {string[]} */ ([])),
    isActive: boolean('is_active').notNull().default(true),
    updatedBy: fk('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('email_templates_org_code_uq').on(t.organisationId, t.code)],
);

/** Which events notify whom. Lets an org mute the noisy ones. */
export const notificationRules = pgTable(
  'notification_rules',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    eventCode: citext('event_code').notNull(),
    notifyCustomer: boolean('notify_customer').notNull().default(true),
    notifyStaff: boolean('notify_staff').notNull().default(false),
    /** Extra fixed recipients, e.g. the shed coordinator's shared inbox. */
    extraRecipients: jsonb('extra_recipients').$type(/** @type {string[]} */ ([])),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('notification_rules_org_event_uq').on(t.organisationId, t.eventCode)],
);

/**
 * Transactional outbox.
 *
 * Emails are inserted in the same transaction as the booking they describe,
 * and sent afterwards by the hourly tick (or immediately, best-effort, after
 * commit). That removes the classic failure where a booking rolls back but
 * the customer has already been told it was confirmed — and it means an SMTP
 * outage delays mail instead of failing bookings.
 */
export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    status: outboxStatusEnum('status').notNull().default('PENDING'),
    toEmail: citext('to_email').notNull(),
    toName: text('to_name'),
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    templateCode: citext('template_code'),
    bookingId: fk('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    userId: fk('user_id').references(() => users.id, { onDelete: 'set null' }),
    attempts: integer('attempts').notNull().default(0),
    /** Exponential backoff target; the tick only picks up due rows. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    providerMessageId: text('provider_message_id'),
    ...timestamps(),
  },
  (t) => [
    index('outbox_messages_due_idx').on(t.status, t.nextAttemptAt),
    index('outbox_messages_booking_idx').on(t.bookingId),
  ],
);

/** Who did what in the admin panel. Append-only. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    actorUserId: fk('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // booking.approve, equipment.update
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: text('entity_id'),
    /** Changed fields only — before/after, with secrets stripped. */
    changes: jsonb('changes').$type(/** @type {Record<string, unknown>} */ ({})),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    ...timestamps(),
  },
  (t) => [
    index('audit_logs_org_created_idx').on(t.organisationId, t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorUserId),
  ],
);

/** CSV/PDF exports are built by the tick, not in the request. */
export const exportJobs = pgTable(
  'export_jobs',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    requestedBy: fk('requested_by').references(() => users.id, { onDelete: 'set null' }),
    kind: varchar('kind', { length: 32 }).notNull(), // bookings | customers | revenue
    format: varchar('format', { length: 8 }).notNull().default('csv'),
    params: jsonb('params').$type(/** @type {Record<string, unknown>} */ ({})),
    status: exportStatusEnum('status').notNull().default('QUEUED'),
    fileId: fk('file_id').references(() => files.id, { onDelete: 'set null' }),
    rowCount: integer('row_count'),
    error: text('error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('export_jobs_org_idx').on(t.organisationId, t.createdAt)],
);

/** Contact-form submissions, kept so nothing is lost if email fails. */
export const contactEnquiries = pgTable(
  'contact_enquiries',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: citext('email').notNull(),
    phone: text('phone'),
    subject: text('subject'),
    message: text('message').notNull(),
    /** Set when the form was submitted by a signed-in customer. */
    userId: fk('user_id').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    handledBy: fk('handled_by').references(() => users.id, { onDelete: 'set null' }),
    staffNotes: text('staff_notes'),
    ipAddress: text('ip_address'),
    ...timestamps(),
  },
  (t) => [index('contact_enquiries_org_idx').on(t.organisationId, t.createdAt)],
);
