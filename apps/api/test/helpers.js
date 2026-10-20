import { sql } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { uuidv7 } from 'uuidv7';
import {
  bookings,
  customerTypes,
  equipment,
  equipmentPrices,
  equipmentUnits,
  locations,
  organisationDomains,
  organisations,
  termsVersions,
  users,
} from '#src/db/schema/index.js';
import { hashPassword } from '#src/lib/password.js';
import { seedDefaultSettings } from '#src/modules/settings/settings.service.js';
import { invalidateSettingsCache } from '#src/modules/settings/settings.service.js';
import { invalidateTenantCache } from '#src/middleware/tenant.js';

/**
 * Wipes every table and clears the in-process caches.
 *
 * TRUNCATE ... CASCADE in one statement is both faster than per-table deletes
 * and immune to foreign-key ordering problems. The caches must be cleared too,
 * or a test would read an organisation that no longer exists.
 */
export async function resetDatabase() {
  const { rows } = await db.execute(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
  `);
  const names = rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
  invalidateSettingsCache();
  invalidateTenantCache();
}

/** A minimal but complete organisation. */
export async function makeOrganisation(overrides = {}) {
  const slug = overrides.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`;
  const [org] = await db
    .insert(organisations)
    .values({
      slug,
      name: 'Test Community Centre',
      timezone: 'Australia/Adelaide',
      currency: 'AUD',
      taxRateBp: 1000,
      ...overrides,
    })
    .returning();

  await db.insert(organisationDomains).values({
    organisationId: org.id,
    hostname: `${slug}.test`,
    app: 'web',
    isPrimary: true,
  });
  await seedDefaultSettings(db, org.id);
  invalidateSettingsCache(org.id);

  // Terms are required to book by default, so an organisation is not usable
  // without a current version. Creating one here keeps every test from having
  // to know that.
  await db.insert(termsVersions).values({
    organisationId: org.id,
    version: 1,
    title: 'Terms of hire',
    bodyMarkdown: 'Test terms.',
    isCurrent: true,
    publishedAt: new Date(),
  });

  return org;
}

export async function makeCustomerType(org, overrides = {}) {
  const [type] = await db
    .insert(customerTypes)
    .values({
      organisationId: org.id,
      code: overrides.code ?? 'NON_PROFIT',
      name: overrides.name ?? 'Community group',
      ...overrides,
    })
    .returning();
  return type;
}

export async function makeUser(org, overrides = {}) {
  const [user] = await db
    .insert(users)
    .values({
      organisationId: org.id,
      email: overrides.email ?? `user-${uuidv7()}@test.local`,
      passwordHash: await hashPassword(overrides.password ?? 'TestPassword123!'),
      firstName: 'Test',
      lastName: 'User',
      phone: '0412 345 678',
      emailVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  return user;
}

export async function makeLocation(org) {
  const [location] = await db
    .insert(locations)
    .values({ organisationId: org.id, name: 'Test Shed', isDefault: true })
    .returning();
  return location;
}

/**
 * Equipment with units and a base rate.
 * @param {object} org
 * @param {{unitCount?: number, bulkQuantity?: number, dayRateCents?: number}} opts
 */
export async function makeEquipment(org, opts = {}) {
  const {
    unitCount = 1,
    inventoryMode = 'SERIALIZED',
    bulkQuantity = 0,
    dayRateCents = 5000,
    bondCents = 0,
    ...overrides
  } = opts;

  const slug = overrides.slug ?? `item-${Math.random().toString(36).slice(2, 8)}`;
  const [item] = await db
    .insert(equipment)
    .values({
      organisationId: org.id,
      slug,
      name: overrides.name ?? 'Test Marquee',
      status: 'PUBLISHED',
      inventoryMode,
      bulkQuantity,
      bondCents,
      minNoticeDays: 0,
      ...overrides,
    })
    .returning();

  if (inventoryMode === 'SERIALIZED' && unitCount > 0) {
    await db.insert(equipmentUnits).values(
      Array.from({ length: unitCount }, (_, i) => ({
        organisationId: org.id,
        equipmentId: item.id,
        assetTag: `${slug.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
        status: 'AVAILABLE',
      })),
    );
  }

  await db.insert(equipmentPrices).values({
    organisationId: org.id,
    equipmentId: item.id,
    tierKind: 'BASE',
    period: 'PER_DAY',
    amountCents: dayRateCents,
    fromUnit: 1,
  });

  return item;
}

/** Dates far enough ahead to satisfy notice rules. */
export function futureWindow(daysAhead = 14, nights = 2) {
  const start = new Date(Date.now() + daysAhead * 86_400_000);
  const end = new Date(start.getTime() + nights * 86_400_000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start, end, startDate: iso(start), endDate: iso(end) };
}

export const countBookings = async (status) => {
  const { rows } = await db.execute(
    status
      ? sql`SELECT count(*)::int AS n FROM ${bookings} WHERE status = ${status}`
      : sql`SELECT count(*)::int AS n FROM ${bookings}`,
  );
  return rows[0].n;
};
