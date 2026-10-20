import { z } from 'zod';
import { paginationSchema, sortSchema } from '#src/lib/pagination.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const browseQuerySchema = paginationSchema.extend({
  category: z.string().trim().max(80).optional(),
  search: z.string().trim().max(120).optional(),
  /** Only items with stock free for this window. */
  availableFrom: isoDate.optional(),
  availableTo: isoDate.optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  /** attr:<definitionId>=<value>, repeated. Parsed in the service. */
  attr: z.union([z.string(), z.array(z.string())]).optional(),
  sort: sortSchema(['name', 'createdAt', 'price'], 'name'),
});

export const availabilityQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const upsertEquipmentSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the item a name').max(160),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens')
      .max(80)
      .optional(),
    sku: z.string().trim().max(40).optional(),
    categoryId: z.uuid().nullable().optional(),
    summary: z.string().trim().max(300).optional(),
    description: z.string().max(20_000).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),

    inventoryMode: z.enum(['SERIALIZED', 'BULK']).default('SERIALIZED'),
    bulkQuantity: z.number().int().min(0).max(100_000).default(0),

    bookingUnit: z.enum(['DAY', 'HOUR']).default('DAY'),
    minHireUnits: z.number().int().min(1).max(365).default(1),
    maxHireUnits: z.number().int().min(1).max(365).nullable().optional(),
    turnaroundHours: z.number().int().min(0).max(720).default(0),
    minNoticeDays: z.number().int().min(0).max(365).default(1),
    maxAdvanceDays: z.number().int().min(1).max(1095).default(365),
    maxPerBooking: z.number().int().min(1).max(1000).nullable().optional(),

    bondCents: z.number().int().min(0).default(0),
    replacementValueCents: z.number().int().min(0).nullable().optional(),

    requiresLicence: z.boolean().default(false),
    requiresTowing: z.boolean().default(false),
    requiresInduction: z.boolean().default(false),
    alwaysRequiresReview: z.boolean().default(false),

    weightKg: z.number().int().min(0).nullable().optional(),
    dimensions: z.string().trim().max(120).optional(),
    safetyNotes: z.string().max(5000).optional(),
    includedItems: z.string().max(5000).optional(),
    pickupInstructions: z.string().max(5000).optional(),
    sortOrder: z.number().int().min(0).max(10_000).default(0),

    attributes: z
      .array(
        z.object({
          attributeDefinitionId: z.uuid(),
          valueText: z.string().max(500).nullable().optional(),
          valueNumber: z.number().int().nullable().optional(),
          valueBool: z.boolean().nullable().optional(),
          valueOptions: z.array(z.string().max(100)).max(30).optional(),
        }),
      )
      .max(40)
      .optional(),
  })
  .refine((v) => v.inventoryMode !== 'BULK' || v.bulkQuantity > 0, {
    message: 'A bulk item needs a quantity of at least 1',
    path: ['bulkQuantity'],
  })
  .refine((v) => !v.maxHireUnits || v.maxHireUnits >= v.minHireUnits, {
    message: 'The maximum hire length cannot be shorter than the minimum',
    path: ['maxHireUnits'],
  });

export const upsertPriceSchema = z
  .object({
    tierKind: z.enum(['BASE', 'CUSTOMER_TYPE']).default('BASE'),
    customerTypeId: z.uuid().nullable().optional(),
    period: z
      .enum(['PER_DAY', 'PER_HOUR', 'PER_BOOKING', 'WEEKEND', 'PER_WEEK'])
      .default('PER_DAY'),
    amountCents: z.number().int().min(0),
    fromUnit: z.number().int().min(1).default(1),
    maxChargeCents: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => (v.tierKind === 'CUSTOMER_TYPE') === Boolean(v.customerTypeId), {
    message: 'A customer-type rate must name a customer type, and a base rate must not',
    path: ['customerTypeId'],
  });

export const upsertUnitSchema = z.object({
  assetTag: z.string().trim().min(1, 'Give the unit an asset tag').max(40),
  serialNumber: z.string().trim().max(80).optional(),
  locationId: z.uuid().nullable().optional(),
  status: z
    .enum(['AVAILABLE', 'ON_HIRE', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED'])
    .default('AVAILABLE'),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'UNSERVICEABLE']).default('GOOD'),
  purchasedAt: z.iso.datetime().nullable().optional(),
  purchaseCostCents: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const blockDatesSchema = z.object({
  equipmentId: z.uuid(),
  unitId: z.uuid().nullable().optional(),
  quantity: z.number().int().min(1).default(1),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  reason: z.enum(['MAINTENANCE', 'CLOSURE', 'INTERNAL_USE', 'RESERVED']),
  note: z.string().max(500).optional(),
});
