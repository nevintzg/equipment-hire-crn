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
import { sql } from 'drizzle-orm';
import { citext, fk, pk, timestamps, deletedAt } from './_shared.js';
import { tokenKindEnum } from './enums.js';

/**
 * Organisations, users, and the role/permission model.
 *
 * Tenancy: the platform runs one organisation per deployment today, but every
 * tenant-owned table carries organisation_id and every query filters on it.
 * That is what lets the team stand up two differently branded demo sites on a
 * single free API and database, and it removes the "rewrite everything"
 * migration if the client later wants genuine multi-tenancy.
 */

export const organisations = pgTable(
  'organisations',
  {
    id: pk(),
    slug: citext('slug').notNull(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    abn: varchar('abn', { length: 20 }),
    /** IANA zone, e.g. Australia/Adelaide. "Days" are counted in this zone. */
    timezone: text('timezone').notNull().default('Australia/Adelaide'),
    currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
    /** GST rate in basis points: 1000 = 10%. Integer, so no float drift. */
    taxRateBp: integer('tax_rate_bp').notNull().default(1000),
    contactEmail: citext('contact_email'),
    contactPhone: text('contact_phone'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    suburb: text('suburb'),
    state: varchar('state', { length: 10 }),
    postcode: varchar('postcode', { length: 10 }),
    /** Per-org Stripe keys, AES-256-GCM encrypted (lib/crypto.js). */
    stripeSecretKeyEnc: text('stripe_secret_key_enc'),
    stripeWebhookSecretEnc: text('stripe_webhook_secret_enc'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('organisations_slug_uq').on(t.slug)],
);

/**
 * Host → organisation mapping. The tenant middleware resolves the request's
 * Host header through this table, which is how one deployment serves
 * hire.exampletown.org.au and gear.anothergroup.org.au with separate branding.
 */
export const organisationDomains = pgTable(
  'organisation_domains',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    hostname: citext('hostname').notNull(),
    /** Which frontend this host serves — customer site or admin panel. */
    app: varchar('app', { length: 16 }).notNull().default('web'),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('organisation_domains_hostname_uq').on(t.hostname, t.app),
    index('organisation_domains_org_idx').on(t.organisationId),
    // At most one primary host per org per app — enforced in 0002_integrity.sql
    // as a partial unique index (WHERE is_primary).
  ],
);

/**
 * Customer categories that drive price tiers and auto-approval.
 * A customer self-selects on registration; staff confirm it, and only a
 * confirmed type unlocks the cheaper rate.
 */
export const customerTypes = pgTable(
  'customer_types',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    code: citext('code').notNull(), // RESIDENT, NON_PROFIT, SCHOOL, BUSINESS
    name: text('name').notNull(),
    description: text('description'),
    /** Requires staff to verify evidence (ABN, enrolment letter) before use. */
    requiresVerification: boolean('requires_verification').notNull().default(false),
    /** Bookings from a confirmed customer of this type skip manual review. */
    autoApprove: boolean('auto_approve').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('customer_types_org_code_uq').on(t.organisationId, t.code)],
);

export const users = pgTable(
  'users',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    passwordHash: text('password_hash'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'),

    /**
     * Optional "I am booking on behalf of" details.
     *
     * Deliberately NOT a separate group-account entity: the client confirmed
     * that bookings are always owned by one accountable individual. A netball
     * club hiring a marquee registers a person, who names the club here. This
     * keeps one identity model and one audit trail.
     */
    hirerOrgName: text('hirer_org_name'),
    hirerAbn: varchar('hirer_abn', { length: 20 }),

    customerTypeId: fk('customer_type_id').references(() => customerTypes.id, {
      onDelete: 'set null',
    }),
    /** Staff have confirmed the claimed customer type. */
    customerTypeConfirmedAt: timestamp('customer_type_confirmed_at', { withTimezone: true }),
    customerTypeConfirmedBy: fk('customer_type_confirmed_by'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    suburb: text('suburb'),
    state: varchar('state', { length: 10 }),
    postcode: varchar('postcode', { length: 10 }),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Staff may block an account without destroying its booking history. */
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    blockedReason: text('blocked_reason'),
    /** Internal notes, never shown to the customer. */
    staffNotes: text('staff_notes'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('users_org_email_uq').on(t.organisationId, t.email),
    index('users_org_created_idx').on(t.organisationId, t.createdAt),
    index('users_customer_type_idx').on(t.customerTypeId),
  ],
);

/**
 * Roles are per-organisation so one org can rename "Operations" to
 * "Shed Volunteer" without affecting another. System roles cannot be deleted.
 */
export const roles = pgTable(
  'roles',
  {
    id: pk(),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    code: citext('code').notNull(), // OWNER, MANAGER, OPERATIONS, FINANCE, CONTENT
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('roles_org_code_uq').on(t.organisationId, t.code)],
);

/** Global catalogue of permissions. Seeded from modules/auth/permissions.js. */
export const permissions = pgTable(
  'permissions',
  {
    id: pk(),
    code: citext('code').notNull(), // e.g. booking.approve
    description: text('description').notNull(),
    group: text('group').notNull(), // UI grouping on the role editor screen
  },
  (t) => [uniqueIndex('permissions_code_uq').on(t.code)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: fk('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: fk('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('role_permissions_pk').on(t.roleId, t.permissionId),
    index('role_permissions_permission_idx').on(t.permissionId),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: fk('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    grantedBy: fk('granted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('user_roles_pk').on(t.userId, t.roleId),
    index('user_roles_role_idx').on(t.roleId),
  ],
);

/**
 * Refresh-token sessions.
 *
 * Only the SHA-256 of the token is stored, so a database leak does not hand
 * over live sessions. Rotation on every refresh plus `replacedBy` lets the
 * service detect a reused (stolen) token and revoke the whole family — see
 * modules/auth/auth.service.js.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: fk('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** 'web' (customer site) or 'admin' — tokens are not interchangeable. */
    app: varchar('app', { length: 16 }).notNull(),
    /** All sessions descended from one login, for family-wide revocation. */
    familyId: fk('family_id').notNull(),
    replacedBy: fk('replaced_by'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_family_idx').on(t.familyId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/** Single-use tokens for email verification, password reset and staff invites. */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: pk(),
    userId: fk('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: tokenKindEnum('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    /** Extra payload, e.g. the role to grant when a staff invite is accepted. */
    meta: jsonb('meta').$type(/** @type {Record<string, unknown>} */ ({})),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_user_kind_idx').on(t.userId, t.kind),
  ],
);
