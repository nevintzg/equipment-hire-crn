import { z } from 'zod';

/**
 * Offset pagination, capped at 100 rows. Admin lists need jump-to-page, which
 * cursor pagination cannot give; the row counts here (thousands, not millions)
 * make the usual deep-offset performance argument irrelevant.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** @param {{page: number, pageSize: number}} p */
export const toLimitOffset = ({ page, pageSize }) => ({
  limit: pageSize,
  offset: (page - 1) * pageSize,
});

/**
 * @template T
 * @param {T[]} rows
 * @param {number} total
 * @param {{page: number, pageSize: number}} p
 */
export const paginated = (rows, total, { page, pageSize }) => ({
  data: rows,
  meta: {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  },
});

/** Sort whitelist — never interpolate a client-supplied column name. */
export const sortSchema = (allowed, fallback) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return { column: fallback, direction: 'desc' };
      const desc = v.startsWith('-');
      const column = desc ? v.slice(1) : v;
      if (!allowed.includes(column)) return { column: fallback, direction: 'desc' };
      return { column, direction: desc ? 'desc' : 'asc' };
    });
