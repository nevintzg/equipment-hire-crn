import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enums live in the database rather than as free text with a CHECK, so that
 * an invalid value is impossible and the set is discoverable from the schema.
 * Adding a value is a migration (ALTER TYPE ... ADD VALUE), which is cheap;
 * removing one is not, so values are only added, never renamed in place.
 */

/** Hire lifecycle. See modules/bookings/booking-state.js for legal transitions. */
export const bookingStatusEnum = pgEnum('booking_status', [
  'PENDING_REVIEW', // submitted, awaiting staff decision
  'APPROVED', // approved, awaiting payment
  'CONFIRMED', // paid, stock reserved
  'PICKED_UP', // with the customer
  'RETURNED', // back, awaiting inspection sign-off
  'COMPLETED', // inspected, bond settled
  'REJECTED', // staff declined
  'EXPIRED', // approved but not paid in time
  'CANCELLED', // withdrawn by customer or staff
]);

/** How an item's stock is tracked. */
export const inventoryModeEnum = pgEnum('inventory_mode', [
  'SERIALIZED', // individually identified units (marquee #3)
  'BULK', // interchangeable pool with a quantity (120 chairs)
]);

/** Smallest hire increment. DAY today; HOUR needs no schema change. */
export const bookingUnitEnum = pgEnum('booking_unit', ['DAY', 'HOUR']);

export const equipmentStatusEnum = pgEnum('equipment_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const unitStatusEnum = pgEnum('unit_status', [
  'AVAILABLE',
  'ON_HIRE',
  'MAINTENANCE',
  'DAMAGED',
  'LOST',
  'RETIRED',
]);

export const conditionEnum = pgEnum('condition_grade', [
  'NEW',
  'GOOD',
  'FAIR',
  'POOR',
  'UNSERVICEABLE',
]);

/** Why a unit or item is unavailable for a period. */
export const blockReasonEnum = pgEnum('block_reason', [
  'BOOKING',
  'MAINTENANCE',
  'CLOSURE', // organisation closed (public holiday, shutdown)
  'INTERNAL_USE',
  'RESERVED', // held by staff for a known request
]);

export const priceTierKindEnum = pgEnum('price_tier_kind', [
  'BASE', // applies to everyone without a more specific tier
  'CUSTOMER_TYPE', // resident / non-profit / school / business
]);

export const pricePeriodEnum = pgEnum('price_period', [
  'PER_DAY',
  'PER_HOUR',
  'PER_BOOKING', // flat fee regardless of duration
  'WEEKEND', // Fri pickup → Mon return treated as one charge
  'PER_WEEK',
]);

export const paymentPurposeEnum = pgEnum('payment_purpose', ['HIRE_AND_BOND', 'EXTRA', 'DAMAGE']);

export const paymentStatusEnum = pgEnum('payment_status', [
  'REQUIRES_PAYMENT',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

export const refundStatusEnum = pgEnum('refund_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'STRIPE_CARD',
  'BANK_TRANSFER', // reconciled manually by staff
  'CASH',
  'WAIVED',
]);

export const attributeTypeEnum = pgEnum('attribute_type', [
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
]);

export const mediaKindEnum = pgEnum('media_kind', ['IMAGE', 'DOCUMENT', 'VIDEO_URL']);

export const tokenKindEnum = pgEnum('token_kind', [
  'EMAIL_VERIFY',
  'PASSWORD_RESET',
  'STAFF_INVITE',
]);

export const outboxStatusEnum = pgEnum('outbox_status', ['PENDING', 'SENT', 'FAILED', 'DEAD']);

export const questionTypeEnum = pgEnum('question_type', [
  'TEXT',
  'LONG_TEXT',
  'SELECT',
  'CHECKBOX',
  'DATE',
  'NUMBER',
]);

export const pageStatusEnum = pgEnum('page_status', ['DRAFT', 'PUBLISHED']);

export const settingTypeEnum = pgEnum('setting_type', [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'JSON',
  'COLOR',
  'FILE',
]);

export const stockAdjustmentReasonEnum = pgEnum('stock_adjustment_reason', [
  'PURCHASE',
  'DONATION',
  'LOSS',
  'DAMAGE_WRITE_OFF',
  'CORRECTION',
  'TRANSFER',
]);

export const exportStatusEnum = pgEnum('export_status', ['QUEUED', 'RUNNING', 'READY', 'FAILED']);
