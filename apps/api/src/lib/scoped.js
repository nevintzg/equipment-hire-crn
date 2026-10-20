import { and, eq, isNull } from 'drizzle-orm';

/**
 * Tenant scoping helpers.
 *
 * Every tenant-owned table has organisation_id, and forgetting it in a WHERE
 * clause is the one bug in a multi-tenant system that leaks another
 * organisation's data. Routing every query through these helpers makes the
 * filter hard to omit and easy to spot in review.
 */

/**
 * @param {{organisationId: import('drizzle-orm/pg-core').PgColumn}} table
 * @param {string} organisationId
 * @param {...unknown} extra
 */
export const scoped = (table, organisationId, ...extra) =>
  and(eq(table.organisationId, organisationId), ...extra.filter(Boolean));

/** Same, but also excludes soft-deleted rows. */
export const scopedLive = (table, organisationId, ...extra) =>
  and(eq(table.organisationId, organisationId), isNull(table.deletedAt), ...extra.filter(Boolean));
