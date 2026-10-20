/**
 * One error type for everything the client is allowed to see.
 *
 * The rule: an AppError is a deliberate, safe-to-expose outcome. Anything else
 * reaching the error handler is a bug and becomes a generic 500, because
 * leaking internal messages is how stack traces end up in screenshots.
 */
export class AppError extends Error {
  /**
   * @param {object} opts
   * @param {number} opts.status  HTTP status
   * @param {string} opts.code    stable machine-readable code for the frontend
   * @param {string} opts.message human-readable, shown to the user
   * @param {unknown} [opts.details] field errors, conflicting ids, etc.
   */
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true;
    Error.captureStackTrace?.(this, AppError);
  }
}

const make = (status, code) => (message, details) =>
  new AppError({ status, code, message, details });

export const badRequest = make(400, 'BAD_REQUEST');
export const validationFailed = make(422, 'VALIDATION_FAILED');
export const unauthorized = make(401, 'UNAUTHORIZED');
export const forbidden = make(403, 'FORBIDDEN');
export const notFound = make(404, 'NOT_FOUND');
/** Genuine conflicts: stock just went, someone else edited the row. */
export const conflict = make(409, 'CONFLICT');
export const gone = make(410, 'GONE');
export const tooManyRequests = make(429, 'TOO_MANY_REQUESTS');
export const internal = make(500, 'INTERNAL_ERROR');
/** Dependency down (Stripe, mail, database asleep) — the client may retry. */
export const unavailable = make(503, 'SERVICE_UNAVAILABLE');

/** Narrow an unknown caught value. */
export const isAppError = (err) => err instanceof AppError;
