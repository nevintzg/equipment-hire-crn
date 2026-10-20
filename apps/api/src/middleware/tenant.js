import { eq } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { organisationDomains, organisations } from '#src/db/schema/index.js';
import { env } from '#src/config/env.js';
import { notFound, unavailable } from '#src/lib/errors.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('tenant');

/**
 * Resolves which organisation a request belongs to, from its Host header.
 *
 * This runs before everything else, so it must be cheap: a database lookup per
 * request to answer a question whose answer changes about once a year would be
 * absurd on a free-tier database that charges for compute time. Hence a short
 * in-process cache. Sixty seconds is long enough to make the lookup
 * negligible and short enough that adding a domain in the admin panel appears
 * to take effect immediately.
 *
 * The cache is per-instance, which is fine: a stale entry only means one
 * instance takes up to a minute to notice a new domain.
 */
const CACHE_TTL_MS = 60_000;
/** @type {Map<string, {value: object | null, expires: number}>} */
const cache = new Map();

export function invalidateTenantCache(hostname) {
  if (hostname) cache.delete(normaliseHost(hostname));
  else cache.clear();
}

const normaliseHost = (host) =>
  String(host ?? '')
    .toLowerCase()
    .split(':')[0]
    .trim();

async function lookupOrganisation(hostname) {
  const cached = cache.get(hostname);
  if (cached && cached.expires > Date.now()) return cached.value;

  const rows = await db
    .select({
      id: organisations.id,
      slug: organisations.slug,
      name: organisations.name,
      timezone: organisations.timezone,
      currency: organisations.currency,
      taxRateBp: organisations.taxRateBp,
      isActive: organisations.isActive,
      app: organisationDomains.app,
    })
    .from(organisationDomains)
    .innerJoin(organisations, eq(organisations.id, organisationDomains.organisationId))
    .where(eq(organisationDomains.hostname, hostname))
    .limit(1);

  let value = rows[0] ?? null;

  // Localhost and preview URLs match no domain row, so fall back to the
  // configured default slug. Without this, local development would need a
  // hosts-file entry on every teammate's machine.
  if (!value) {
    const [fallback] = await db
      .select({
        id: organisations.id,
        slug: organisations.slug,
        name: organisations.name,
        timezone: organisations.timezone,
        currency: organisations.currency,
        taxRateBp: organisations.taxRateBp,
        isActive: organisations.isActive,
      })
      .from(organisations)
      .where(eq(organisations.slug, env.DEFAULT_ORG_SLUG))
      .limit(1);
    value = fallback ?? null;
  }

  cache.set(hostname, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Express middleware. Sets req.org.
 * @type {import('express').RequestHandler}
 */
export async function resolveTenant(req, _res, next) {
  try {
    const hostname = normaliseHost(req.headers['x-forwarded-host'] ?? req.headers.host);
    const org = await lookupOrganisation(hostname);

    if (!org) {
      log.warn({ hostname }, 'No organisation for host');
      throw notFound('This site is not configured. Please contact the administrator.');
    }
    if (!org.isActive) {
      throw unavailable('This site is temporarily unavailable.');
    }

    req.org = org;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Whether an Origin may send credentialed requests.
 *
 * Both the statically configured frontends and any hostname registered as an
 * organisation domain are allowed, because each tenant's customer site is
 * served from its own domain.
 */
export async function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin or non-browser client
  const configured = [env.PUBLIC_WEB_URL, env.PUBLIC_ADMIN_URL, ...env.EXTRA_CORS_ORIGINS].map(
    (u) => u.replace(/\/$/, ''),
  );
  if (configured.includes(origin.replace(/\/$/, ''))) return true;

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    const [row] = await db
      .select({ id: organisationDomains.id })
      .from(organisationDomains)
      .where(eq(organisationDomains.hostname, hostname))
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}
