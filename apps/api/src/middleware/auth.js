import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { users } from '#src/db/schema/index.js';
import { verifyAccessToken } from '#src/lib/jwt.js';
import { forbidden, unauthorized } from '#src/lib/errors.js';

/**
 * Authentication and authorisation.
 *
 * `app` is the important parameter. The customer site and the admin panel are
 * separate deployments with separate cookies and separate token audiences, so
 * a token minted for the public site is rejected by admin routes even when its
 * owner is a staff member. That means an XSS bug on the customer site — the
 * surface with user-generated content and the widest audience — cannot be
 * escalated into back-office access.
 *
 * @param {'web'|'admin'} app
 * @param {{optional?: boolean}} [opts]
 * @returns {import('express').RequestHandler}
 */
export function authenticate(app, { optional = false } = {}) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

      if (!token) {
        if (optional) {
          req.auth = null;
          return next();
        }
        throw unauthorized('Please sign in to continue.');
      }

      const claims = await verifyAccessToken(token, app);

      // The token says which organisation it was issued for; the request's
      // host says which one is being addressed. A mismatch means a token from
      // one tenant is being replayed against another.
      if (req.org && claims.organisationId !== req.org.id) {
        throw unauthorized('Please sign in to continue.');
      }

      // One lookup per request, to catch accounts blocked or deleted since the
      // token was issued. Permissions come from the token (see lib/jwt.js);
      // this check is about the account still existing and being usable.
      //
      // The whole row is loaded, minus the password hash: services downstream
      // read the profile (phone, hiring organisation, confirmed customer type)
      // and a partial projection here would silently hand them undefined.
      const [row] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, claims.userId), isNull(users.deletedAt)))
        .limit(1);

      if (!row) throw unauthorized('Please sign in to continue.');
      const { passwordHash: _passwordHash, ...user } = row;
      if (user.blockedAt) {
        throw forbidden('This account has been suspended. Please contact us.');
      }

      req.auth = {
        user,
        userId: user.id,
        organisationId: claims.organisationId,
        app: claims.app,
        permissions: new Set(claims.permissions),
        sessionId: claims.sessionId,
      };
      next();
    } catch (err) {
      if (optional) {
        req.auth = null;
        return next();
      }
      next(err);
    }
  };
}

/**
 * Requires one or more permission codes. Multiple codes are ANDed.
 * @param {...string} required
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(...required) {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized('Please sign in to continue.'));
    const held = req.auth.permissions;
    const missing = required.filter((code) => !held.has(code) && !held.has('*'));
    if (missing.length) {
      return next(
        forbidden('You do not have permission to do that.', { requiredPermissions: missing }),
      );
    }
    next();
  };
}

/** Requires any one of the listed permissions (ORed). */
export function requireAnyPermission(...candidates) {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized('Please sign in to continue.'));
    const held = req.auth.permissions;
    if (held.has('*') || candidates.some((code) => held.has(code))) return next();
    next(forbidden('You do not have permission to do that.', { requiredAnyOf: candidates }));
  };
}

/** Routes that must not be used before the email address is verified. */
export const requireVerifiedEmail = (req, _res, next) => {
  if (!req.auth) return next(unauthorized('Please sign in to continue.'));
  if (!req.auth.user.emailVerifiedAt) {
    return next(forbidden('Please confirm your email address first. Check your inbox.'));
  }
  next();
};
