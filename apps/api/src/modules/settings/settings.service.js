import { eq } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { settings } from '#src/db/schema/index.js';
import { SETTING_DEFINITIONS, validateSetting } from './settings.schemas.js';
import { badRequest } from '#src/lib/errors.js';
import { invalidateTenantCache } from '#src/middleware/tenant.js';

/**
 * Settings reads happen on nearly every request (branding, booking policy), so
 * they are cached per organisation for a short time. The database on a free
 * tier bills for compute; re-reading a dozen rows that change monthly is not a
 * good use of it.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map();

export function invalidateSettingsCache(organisationId) {
  if (organisationId) cache.delete(organisationId);
  else cache.clear();
}

/**
 * All settings for an organisation, merged over the declared defaults, so a
 * key that has never been saved still returns a usable value.
 *
 * Pass the caller's transaction as `exec` when calling this from inside one:
 * a cache miss would otherwise take a second pooled connection while the
 * transaction still holds the first, which deadlocks the pool under load.
 *
 * @param {string} organisationId
 * @param {import('#src/db/client.js').Tx | typeof db} [exec]
 */
export async function getSettings(organisationId, exec = db) {
  const hit = cache.get(organisationId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const rows = await exec
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.organisationId, organisationId));

  const merged = {};
  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) merged[key] = def.default;
  for (const row of rows) merged[row.key] = row.value;

  cache.set(organisationId, { value: merged, expires: Date.now() + CACHE_TTL_MS });
  return merged;
}

/** One setting, typed by its declaration. */
export async function getSetting(organisationId, key, exec = db) {
  const all = await getSettings(organisationId, exec);
  return all[key];
}

/** Only the keys marked public — safe to serve to an unauthenticated visitor. */
export async function getPublicSettings(organisationId, exec = db) {
  const all = await getSettings(organisationId, exec);
  return Object.fromEntries(
    Object.entries(all).filter(([key]) => SETTING_DEFINITIONS[key]?.isPublic),
  );
}

/**
 * Validate and persist a batch. All-or-nothing: a form that fails on one field
 * should not half-apply.
 *
 * @param {string} organisationId
 * @param {Record<string, unknown>} patch
 * @param {string} [actorUserId]
 */
export async function updateSettings(organisationId, patch, actorUserId) {
  const errors = [];
  const valid = [];

  for (const [key, raw] of Object.entries(patch)) {
    const result = validateSetting(key, raw);
    if (!result.ok) errors.push({ field: key, message: result.error });
    else valid.push({ key, ...result });
  }
  if (errors.length) throw badRequest('Some settings are not valid.', errors);

  await db.transaction(async (tx) => {
    for (const item of valid) {
      await tx
        .insert(settings)
        .values({
          organisationId,
          key: item.key,
          group: item.key.split('.')[0],
          type: item.type,
          value: item.value,
          isPublic: item.isPublic,
          updatedBy: actorUserId ?? null,
        })
        .onConflictDoUpdate({
          target: [settings.organisationId, settings.key],
          set: { value: item.value, updatedBy: actorUserId ?? null, updatedAt: new Date() },
        });
    }
  });

  invalidateSettingsCache(organisationId);
  // Branding is baked into the tenant payload the frontends read on boot.
  invalidateTenantCache();

  return getSettings(organisationId);
}

/** Settings grouped for the admin UI, with their declarations attached. */
export async function getSettingsForAdmin(organisationId) {
  const values = await getSettings(organisationId);
  const grouped = {};
  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    const group = key.split('.')[0];
    grouped[group] ??= [];
    grouped[group].push({
      key,
      type: def.type,
      isPublic: def.isPublic,
      value: values[key],
      default: def.default,
    });
  }
  return grouped;
}

/** Seed the declared defaults for a new organisation. */
export async function seedDefaultSettings(tx, organisationId) {
  const rows = Object.entries(SETTING_DEFINITIONS).map(([key, def]) => ({
    organisationId,
    key,
    group: key.split('.')[0],
    type: def.type,
    value: def.default,
    isPublic: def.isPublic,
  }));
  await tx.insert(settings).values(rows).onConflictDoNothing();
  invalidateSettingsCache(organisationId);
}
