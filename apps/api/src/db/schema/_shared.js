import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

/**
 * Building blocks reused by every table.
 */

/**
 * Case-insensitive text. Used for email addresses and hostnames, where
 * "Dave@Example.org" and "dave@example.org" must collide on a unique index.
 * Requires the citext extension (drizzle/0000_extensions.sql).
 */
export const citext = customType({
  dataType: () => 'citext',
});

/**
 * Postgres range of timestamptz. This is what makes overlap detection a
 * database guarantee rather than an application convention: combined with a
 * GiST exclusion constraint, two overlapping rows for the same unit cannot be
 * inserted, no matter how many API instances race.
 *
 * Stored half-open: [start, end) — a booking ending at 10:00 and another
 * starting at 10:00 do not overlap.
 */
export const tstzrange = customType({
  dataType: () => 'tstzrange',
});

/**
 * Primary key.
 *
 * UUIDv7 rather than v4: the first 48 bits are a millisecond timestamp, so
 * keys sort chronologically. That keeps B-tree inserts at the right-hand edge
 * of the index (no page splits across the whole index like random v4 keys
 * cause) and makes `ORDER BY id` a usable proxy for creation order.
 * Generated in the application so that a row's id is known before insert —
 * needed when building a booking and its children in one transaction.
 */
export const pk = () =>
  uuid('id')
    .primaryKey()
    // Generated in the application so a row's id is known before insert.
    .$defaultFn(() => uuidv7())
    // Also defaulted in the database (function created in 0000_extensions.sql)
    // so seeds and manual SQL get a v7 id rather than a not-null violation.
    .default(sql`uuid_generate_v7()`);

/** Foreign-key column, same type as pk(). */
export const fk = (name) => uuid(name);

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`);

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date());

/** created_at + updated_at, spread into a table definition. */
export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Nullable soft-delete marker. Only used where history must survive. */
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true, mode: 'date' });

/** Money. Always integer minor units (cents) — never a float, never numeric. */
export const money = (name) => ({ name });
