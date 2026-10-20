/**
 * Single import surface for the schema.
 *
 *   import { bookings, equipment } from '#src/db/schema/index.js';
 *
 * drizzle.config.js points at this file, so anything exported here is part of
 * the generated migrations — and anything not exported silently is not.
 */
export * from './enums.js';
export * from './identity.js';
export * from './catalogue.js';
export * from './inventory.js';
export * from './bookings.js';
export * from './payments.js';
export * from './config.js';
export * from './relations.js';
