import { forbidden } from '#src/lib/errors.js';
import { isAllowedOrigin } from './tenant.js';

/**
 * CSRF defence for the cookie-authenticated routes.
 *
 * Only /auth/refresh and /auth/logout read the refresh cookie; every other
 * authenticated route needs an Authorization header, which a cross-site form
 * post cannot set. So rather than a token-based CSRF scheme with its own
 * storage and rotation, those two routes verify the Origin header, and the
 * cookies themselves are SameSite=Lax (dev) / None+Secure with a scoped path
 * (production, where the frontends sit on different subdomains).
 *
 * Browsers always send Origin on cross-origin requests and cannot be told to
 * forge it, so a missing-but-required Origin is treated as suspicious on
 * state-changing methods.
 *
 * @type {import('express').RequestHandler}
 */
export async function requireTrustedOrigin(req, _res, next) {
  try {
    const origin = req.headers.origin;

    if (!origin) {
      // Non-browser clients (curl, the mobile app, server-to-server) send no
      // Origin. They also cannot be victims of CSRF, which needs a browser
      // with an existing cookie. Allow only safe methods without one.
      if (req.method === 'GET' || req.method === 'HEAD') return next();
      // A same-origin fetch from the frontend always carries Origin, so this
      // is only reached by a non-browser caller, which must use a header token.
      if (req.headers.authorization) return next();
      throw forbidden('This request is missing its origin.');
    }

    if (!(await isAllowedOrigin(origin))) {
      req.log?.warn({ origin }, 'Rejected untrusted origin');
      throw forbidden('This origin is not permitted.');
    }
    next();
  } catch (err) {
    next(err);
  }
}
