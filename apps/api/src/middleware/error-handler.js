import { ZodError } from 'zod';
import { AppError } from '#src/lib/errors.js';
import { isProduction } from '#src/config/env.js';

/**
 * Postgres error codes this API can translate into something a user can act on.
 *
 * 23P01 is the interesting one: it is what the booking exclusion constraint
 * raises when two people check out the same unit at the same moment. Rather
 * than a 500, the loser of that race gets a clear "just taken" message — the
 * database is doing the concurrency control and this is where that surfaces.
 */
const PG_CODES = {
  23505: {
    status: 409,
    code: 'DUPLICATE',
    message: 'That already exists. Please check and try again.',
  },
  '23P01': {
    status: 409,
    code: 'ALREADY_BOOKED',
    message: 'Sorry — that item was just booked by someone else for those dates.',
  },
  23503: {
    status: 409,
    code: 'REFERENCE_IN_USE',
    message: 'That item is referenced elsewhere and cannot be changed or removed.',
  },
  23514: {
    status: 422,
    code: 'CONSTRAINT_FAILED',
    message: 'Those values are not valid. Please review and try again.',
  },
  40001: {
    status: 409,
    code: 'CONCURRENT_UPDATE',
    message: 'Someone else changed this at the same time. Please try again.',
  },
  '40P01': {
    status: 409,
    code: 'CONCURRENT_UPDATE',
    message: 'Someone else changed this at the same time. Please try again.',
  },
  57014: { status: 503, code: 'TIMEOUT', message: 'That took too long. Please try again.' },
  53300: {
    status: 503,
    code: 'DATABASE_BUSY',
    message: 'The service is busy. Please try again in a moment.',
  },
};

/** 404 for unmatched routes — registered after all routers. */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.path}`,
      requestId: req.id,
    },
  });
};

/**
 * Terminal error handler.
 *
 * Express 5 forwards rejected promises here automatically, which is why no
 * route handler in this codebase wraps itself in try/catch.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars -- Express identifies this by arity
export function errorHandler(err, req, res, next) {
  // Deliberate, safe-to-expose outcomes.
  if (err instanceof AppError) {
    if (err.status >= 500) req.log?.error({ err }, err.message);
    else req.log?.warn({ code: err.code, status: err.status }, err.message);
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId: req.id },
    });
  }

  // A schema that was checked somewhere other than the validate middleware.
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some of the information provided is not valid.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        requestId: req.id,
      },
    });
  }

  const pg = err?.code ? PG_CODES[err.code] : null;
  if (pg) {
    req.log?.warn({ pgCode: err.code, constraint: err.constraint, detail: err.detail }, pg.message);
    return res.status(pg.status).json({
      error: {
        code: pg.code,
        message: pg.message,
        // The constraint name is safe and genuinely useful to the frontend.
        details: err.constraint ? { constraint: err.constraint } : undefined,
        requestId: req.id,
      },
    });
  }

  // Malformed JSON from body-parser.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'The request body is not valid JSON.',
        requestId: req.id,
      },
    });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'That request is too large.',
        requestId: req.id,
      },
    });
  }
  if (err?.message === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({
      error: {
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'This origin is not permitted.',
        requestId: req.id,
      },
    });
  }

  // Anything else is a bug. Log it in full, tell the user nothing.
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end. Please try again.',
      requestId: req.id,
      // Stack traces only outside production.
      ...(isProduction ? {} : { debug: { message: err?.message, stack: err?.stack } }),
    },
  });
}
