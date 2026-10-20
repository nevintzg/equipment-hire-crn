import { z } from 'zod';

/**
 * Settings are a key/value table rather than columns, because the whole point
 * of the product is that a new organisation configures it instead of asking a
 * developer for a migration. The trade-off is that the schema moves from the
 * database into here — so every key is declared with its type and default, and
 * unknown keys are rejected.
 */

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #0F6E56');

export const SETTINGS_GROUPS = {
  branding: {
    'branding.organisationName': {
      type: 'STRING',
      schema: z.string().min(1).max(120),
      isPublic: true,
      default: 'Community Equipment Hire',
    },
    'branding.tagline': {
      type: 'STRING',
      schema: z.string().max(200),
      isPublic: true,
      default: 'Equipment for community events',
    },
    'branding.primaryColour': { type: 'COLOR', schema: colour, isPublic: true, default: '#0F6E56' },
    'branding.accentColour': { type: 'COLOR', schema: colour, isPublic: true, default: '#E8B33A' },
    'branding.logoFileId': {
      type: 'FILE',
      schema: z.uuid().nullable(),
      isPublic: true,
      default: null,
    },
    'branding.faviconFileId': {
      type: 'FILE',
      schema: z.uuid().nullable(),
      isPublic: true,
      default: null,
    },
  },

  contact: {
    'contact.email': { type: 'STRING', schema: z.string().max(254), isPublic: true, default: '' },
    'contact.phone': { type: 'STRING', schema: z.string().max(40), isPublic: true, default: '' },
    'contact.address': { type: 'STRING', schema: z.string().max(300), isPublic: true, default: '' },
    'contact.openingHours': {
      type: 'STRING',
      schema: z.string().max(500),
      isPublic: true,
      default: '',
    },
  },

  booking: {
    /** How long an approved booking is held before the approval lapses. */
    'booking.paymentWindowHours': {
      type: 'NUMBER',
      schema: z.number().int().min(1).max(336),
      isPublic: true,
      default: 72,
    },
    /** Whether customers may cancel themselves, or must ask staff. */
    'booking.allowSelfCancellation': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: true,
      default: true,
    },
    'booking.maxActiveBookingsPerCustomer': {
      type: 'NUMBER',
      schema: z.number().int().min(1).max(50),
      isPublic: false,
      default: 3,
    },
    'booking.requireEmailVerification': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: true,
      default: true,
    },
    'booking.requirePhone': { type: 'BOOLEAN', schema: z.boolean(), isPublic: true, default: true },
    /** Charged per day late, in cents. Zero disables late fees. */
    'booking.lateFeePerDayCents': {
      type: 'NUMBER',
      schema: z.number().int().min(0),
      isPublic: true,
      default: 0,
    },
    'booking.termsRequired': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: true,
      default: true,
    },
    /** Blackout dates (yyyy-MM-dd) when nothing may be collected or returned. */
    'booking.closedDates': {
      type: 'JSON',
      schema: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
      isPublic: true,
      default: [],
    },
  },

  payments: {
    'payments.enabled': { type: 'BOOLEAN', schema: z.boolean(), isPublic: true, default: true },
    'payments.allowBankTransfer': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: true,
      default: false,
    },
    'payments.bankTransferInstructions': {
      type: 'STRING',
      schema: z.string().max(1000),
      isPublic: false,
      default: '',
    },
    /** Bonds can be switched off entirely for a trusting organisation. */
    'payments.bondsEnabled': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: true,
      default: true,
    },
    'payments.autoRefundBond': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: false,
      default: false,
    },
  },

  site: {
    'site.heroHeading': {
      type: 'STRING',
      schema: z.string().max(160),
      isPublic: true,
      default: 'Borrow what you need for your next community event',
    },
    'site.heroSubheading': {
      type: 'STRING',
      schema: z.string().max(300),
      isPublic: true,
      default:
        'Marquees, tables, sound systems and more — available to local groups, schools and residents.',
    },
    'site.showPrices': { type: 'BOOLEAN', schema: z.boolean(), isPublic: true, default: true },
    'site.requireLoginToBrowse': {
      type: 'BOOLEAN',
      schema: z.boolean(),
      isPublic: true,
      default: false,
    },
    'site.footerText': { type: 'STRING', schema: z.string().max(500), isPublic: true, default: '' },
    'site.socialLinks': {
      type: 'JSON',
      schema: z.record(z.string(), z.string()).default({}),
      isPublic: true,
      default: {},
    },
  },
};

/** Flat map of every declared key. */
export const SETTING_DEFINITIONS = Object.values(SETTINGS_GROUPS).reduce(
  (acc, group) => Object.assign(acc, group),
  {},
);

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS);

/** Validate one key/value pair against its declared schema. */
export function validateSetting(key, value) {
  const def = SETTING_DEFINITIONS[key];
  if (!def) return { ok: false, error: `Unknown setting: ${key}` };
  const result = def.schema.safeParse(value);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { ok: true, value: result.data, type: def.type, isPublic: def.isPublic };
}

export const updateSettingsSchema = z.object({
  settings: z
    .record(z.string(), z.unknown())
    .refine(
      (obj) => Object.keys(obj).every((k) => SETTING_KEYS.includes(k)),
      'One or more settings are not recognised',
    ),
});

/**
 * Auto-approval conditions.
 *
 * A closed vocabulary rather than a rule language: everything an organisation
 * can express here is something the booking service knows how to evaluate, so
 * a volunteer administrator cannot write a rule that fails at checkout.
 */
export const autoApprovalConditionsSchema = z.object({
  maxTotalCents: z.number().int().min(0).optional(),
  maxItems: z.number().int().min(1).optional(),
  maxDays: z.number().int().min(1).optional(),
  minNoticeDays: z.number().int().min(0).optional(),
  requireVerifiedEmail: z.boolean().optional(),
  requireConfirmedCustomerType: z.boolean().optional(),
  requireNoOverdueHistory: z.boolean().optional(),
  minCompletedBookings: z.number().int().min(0).optional(),
  excludeBondedItems: z.boolean().optional(),
});

export const upsertAutoApprovalRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priority: z.number().int().min(1).max(1000).default(100),
  customerTypeId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  conditions: autoApprovalConditionsSchema.default({}),
  approve: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const upsertCancellationTierSchema = z.object({
  minHoursBefore: z.number().int().min(0).max(8760),
  refundPercent: z.number().int().min(0).max(100),
  feeCents: z.number().int().min(0).default(0),
  label: z.string().trim().min(1).max(120),
  isActive: z.boolean().default(true),
});
