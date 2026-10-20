import { z } from 'zod';
import { paginationSchema, sortSchema } from '#src/lib/pagination.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');

export const basketItemSchema = z.object({
  equipmentId: z.uuid(),
  quantity: z.number().int().min(1).max(500),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Dates arrive as local calendar dates plus a slot time, not as instants.
 *
 * That is on purpose: the customer picks "Saturday 14 March, 9am pickup" in
 * the organisation's timezone. Letting the browser send a UTC instant would
 * mean a customer in another timezone, or a device with the wrong clock,
 * silently books a different day.
 */
export const quoteSchema = z.object({
  items: z.array(basketItemSchema).min(1, 'Add at least one item').max(50),
  startDate: isoDate,
  endDate: isoDate,
  startTime: time.default('09:00'),
  endTime: time.default('17:00'),
  pickupLocationId: z.uuid().optional(),
});

export const createBookingSchema = quoteSchema.extend({
  pickupLocationId: z.uuid().optional(),
  returnLocationId: z.uuid().optional(),
  pickupSlotId: z.uuid().optional(),
  returnSlotId: z.uuid().optional(),
  purpose: z.string().trim().max(300).optional(),
  expectedAttendees: z.number().int().min(0).max(100_000).optional(),
  deliveryRequired: z.boolean().default(false),
  deliveryAddress: z.string().trim().max(300).optional(),
  customerNotes: z.string().trim().max(2000).optional(),
  answers: z
    .array(z.object({ questionId: z.uuid(), answer: z.string().max(2000) }))
    .max(30)
    .default([]),
  acceptTerms: z.literal(true, { message: 'Please accept the terms of hire' }),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const rejectBookingSchema = z.object({
  reason: z.string().trim().min(1, 'Give a reason so the customer knows why').max(500),
});

export const approveBookingSchema = z.object({
  staffNotes: z.string().trim().max(2000).optional(),
  /** Override the configured payment window for this one booking. */
  paymentWindowHours: z.number().int().min(1).max(336).optional(),
  /** Goodwill discount, in cents. */
  discountCents: z.number().int().min(0).optional(),
});

export const listBookingsQuerySchema = paginationSchema.extend({
  status: z
    .union([
      z.enum([
        'PENDING_REVIEW',
        'APPROVED',
        'CONFIRMED',
        'PICKED_UP',
        'RETURNED',
        'COMPLETED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED',
      ]),
      z.literal('OVERDUE'),
      z.literal('ACTIVE'),
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
  customerId: z.uuid().optional(),
  equipmentId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: sortSchema(['createdAt', 'startAt', 'endAt', 'totalDueCents', 'reference'], 'createdAt'),
});

export const handoverSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
  /** Condition recorded per unit at pickup, so disputes have a baseline. */
  conditions: z
    .array(
      z.object({
        unitId: z.uuid().optional(),
        bookingItemId: z.uuid(),
        condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'UNSERVICEABLE']),
        notes: z.string().max(500).optional(),
        photoFileId: z.uuid().optional(),
      }),
    )
    .max(100)
    .default([]),
});

export const inspectionSchema = z.object({
  allItemsReturned: z.boolean().default(true),
  summary: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        bookingItemId: z.uuid(),
        unitId: z.uuid().optional(),
        quantityReturned: z.number().int().min(0),
        quantityMissing: z.number().int().min(0).default(0),
        conditionOnReturn: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'UNSERVICEABLE']),
        isDamaged: z.boolean().default(false),
        isCleaningRequired: z.boolean().default(false),
        notes: z.string().max(1000).optional(),
        photoFileId: z.uuid().optional(),
      }),
    )
    .min(1),
  deductions: z
    .array(
      z.object({
        bookingItemId: z.uuid().optional(),
        kind: z.enum(['DAMAGE', 'MISSING', 'CLEANING', 'LATE_RETURN', 'OTHER']),
        amountCents: z.number().int().min(1),
        description: z.string().trim().min(1).max(500),
      }),
    )
    .max(50)
    .default([]),
});

export const reallocateSchema = z.object({
  allocationId: z.uuid(),
  newUnitId: z.uuid(),
  reason: z.string().trim().max(300).optional(),
});
