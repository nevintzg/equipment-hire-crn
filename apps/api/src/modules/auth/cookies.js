import { env, isProduction } from '#src/config/env.js';

/**
 * Refresh-token cookies.
 *
 * Two separate cookies, one per app, each scoped to the path of the route that
 * reads it:
 *
 *   rt_web   → /api/v1/auth
 *   rt_admin → /api/v1/admin/auth
 *
 * The scoping matters. Without it, every request from either frontend would
 * carry both refresh tokens, so an XSS payload on the customer site could
 * trigger a request that refreshes an admin session. With Path set, the
 * browser only attaches each cookie to the one endpoint that needs it.
 *
 * SameSite: Lax locally (frontend and API share localhost), None in
 * production, because the API is on its own subdomain and a cross-site cookie
 * is unavoidable there. None requires Secure, which is correct anyway.
 */
const COOKIE_NAMES = { web: 'rt_web', admin: 'rt_admin' };
const COOKIE_PATHS = { web: '/api/v1/auth', admin: '/api/v1/admin/auth' };

export const refreshCookieName = (app) => COOKIE_NAMES[app];

const options = (app) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: COOKIE_PATHS[app],
  domain: isProduction && env.COOKIE_DOMAIN ? env.COOKIE_DOMAIN : undefined,
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  // Opaque random string, so signing adds nothing; the token's value is
  // verified against a hash in the sessions table.
  signed: false,
});

/**
 * @param {import('express').Response} res
 * @param {'web'|'admin'} app
 * @param {string} token
 */
export function setRefreshCookie(res, app, token) {
  res.cookie(COOKIE_NAMES[app], token, options(app));
}

export function clearRefreshCookie(res, app) {
  res.clearCookie(COOKIE_NAMES[app], { ...options(app), maxAge: undefined });
}

export const readRefreshCookie = (req, app) => req.cookies?.[COOKIE_NAMES[app]] ?? null;
