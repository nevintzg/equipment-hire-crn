import { SignJWT, jwtVerify } from 'jose';
import { env } from '#src/config/env.js';
import { unauthorized } from './errors.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALG = 'HS256';
const ISSUER = 'eqhire-api';

/**
 * Access tokens.
 *
 * Short-lived (15 minutes) and held in memory by the frontend, never in
 * localStorage — an XSS bug should not hand over a long-lived credential. The
 * refresh token lives in an httpOnly cookie instead.
 *
 * The payload carries organisation id and the user's permission codes so that
 * authorising a request costs no database round trip. The trade-off is that a
 * permission revoked mid-session stays effective until the token expires;
 * fifteen minutes is an acceptable window for this product, and anything
 * genuinely destructive re-checks against the database.
 *
 * `kind` separates the customer site from the admin panel: an access token
 * minted for the public site is rejected by admin routes even if the user
 * happens to be staff, so a stolen customer token cannot reach the back office.
 */

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.organisationId
 * @param {'web'|'admin'} p.app
 * @param {string[]} p.permissions
 * @param {string} p.sessionId
 */
export async function signAccessToken({ userId, organisationId, app, permissions, sessionId }) {
  return new SignJWT({ org: organisationId, kind: app, perms: permissions, sid: sessionId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(app)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MIN}m`)
    .sign(secret);
}

/**
 * @param {string} token
 * @param {'web'|'admin'} app - audience the caller expects
 */
export async function verifyAccessToken(token, app) {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: app,
      algorithms: [ALG],
    });
    return {
      userId: /** @type {string} */ (payload.sub),
      organisationId: /** @type {string} */ (payload.org),
      app: /** @type {'web'|'admin'} */ (payload.kind),
      permissions: /** @type {string[]} */ (payload.perms ?? []),
      sessionId: /** @type {string} */ (payload.sid),
    };
  } catch {
    // Never surface the library's reason: "signature verification failed" vs
    // "expired" tells an attacker which half of the token to work on.
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}
