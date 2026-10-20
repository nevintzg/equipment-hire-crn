import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { isTest } from '#src/config/env.js';

/**
 * Rate limiting.
 *
 * In-memory, per-instance: there is no Redis in this architecture (see the
 * notes in the cron workflow), and on a single free-tier instance the counters
 * are effectively global anyway. If the deployment ever scales out, these
 * limits become per-instance — which is a weakening, not a break.
 *
 * `trust proxy` is set to 1 in app.js so req.ip is the real client address
 * behind the host's load balancer rather than its internal one.
 */
const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest, // limits would make tests flaky and slow
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attempts. Please wait a moment and try again.',
    },
  },
};

/** Everything, as a blunt backstop. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 300,
});

/**
 * Login, registration, password reset.
 *
 * Keyed on IP *and* the submitted email, so one attacker cannot lock a victim
 * out of their own account by hammering it from many addresses — a plain
 * per-email limit is a denial-of-service tool.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 10,
  // ipKeyGenerator normalises IPv6 so a /64 cannot be used to multiply quota.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').toLowerCase()}`,
});

/** Submitting a booking — generous, but stops a runaway loop. */
export const bookingLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
});

/** Public forms with no authentication at all. */
export const publicFormLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 10,
});
