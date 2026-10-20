import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '#src/db/client.js';
import {
  availabilityBlocks,
  attributeDefinitions,
  bookingItems,
  categories,
  equipment,
  equipmentAttributeValues,
  equipmentMedia,
  equipmentPrices,
  equipmentUnits,
  files,
  relatedEquipment,
} from '#src/db/schema/index.js';
import {
  dailyAvailability,
  totalCapacity,
} from '#src/modules/availability/availability.service.js';
import { resolveRates, priceForDays } from '#src/modules/pricing/pricing.js';
import { getSettings } from '#src/modules/settings/settings.service.js';
import { localDayBounds, toRange } from '#src/lib/time.js';
import { notFound } from '#src/lib/errors.js';
import { paginated, toLimitOffset } from '#src/lib/pagination.js';
import { slugify } from '#src/lib/format.js';

/**
 * The public catalogue, and the staff CRUD behind it.
 */

/** Media and the "from" price, fetched for a page of results in two queries. */
async function decorate(org, rows, customer) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const settings = await getSettings(org.id);
  const showPrices = settings['site.showPrices'] !== false;

  const [media, rates] = await Promise.all([
    db
      .select({
        equipmentId: equipmentMedia.equipmentId,
        storageKey: files.storageKey,
        altText: equipmentMedia.altText,
        isPrimary: equipmentMedia.isPrimary,
        sortOrder: equipmentMedia.sortOrder,
      })
      .from(equipmentMedia)
      .leftJoin(files, eq(files.id, equipmentMedia.fileId))
      .where(and(inArray(equipmentMedia.equipmentId, ids), eq(equipmentMedia.kind, 'IMAGE')))
      .orderBy(desc(equipmentMedia.isPrimary), asc(equipmentMedia.sortOrder)),
    showPrices
      ? db
          .select()
          .from(equipmentPrices)
          .where(and(inArray(equipmentPrices.equipmentId, ids), eq(equipmentPrices.isActive, true)))
      : Promise.resolve([]),
  ]);

  return rows.map((row) => {
    const images = media.filter((m) => m.equipmentId === row.id);
    const applicable = resolveRates(
      rates.filter((r) => r.equipmentId === row.id),
      customer ?? {},
    );
    // "From $x a day" — one day at the cheapest applicable tier.
    const fromPrice = applicable.length ? priceForDays(applicable, 1, 1) : null;
    return {
      ...row,
      images: images.map((i) => ({ storageKey: i.storageKey, altText: i.altText })),
      primaryImage: images[0]?.storageKey ?? null,
      pricing: showPrices
        ? {
            fromCents: fromPrice?.lineCents ?? 0,
            period: fromPrice?.period ?? 'PER_DAY',
            bondCents: row.bondCents,
          }
        : null,
    };
  });
}

/**
 * Browse published equipment.
 *
 * The availability filter is a NOT EXISTS subquery rather than a post-filter in
 * JavaScript, so paging stays correct: filtering after the LIMIT would return
 * short pages and a wrong total.
 */
export async function browseEquipment({ org, query, customer }) {
  const { limit, offset } = toLimitOffset(query);
  const filters = [
    eq(equipment.organisationId, org.id),
    eq(equipment.status, 'PUBLISHED'),
    isNull(equipment.deletedAt),
  ];

  if (query.category) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.organisationId, org.id), eq(categories.slug, query.category)))
      .limit(1);
    if (!cat) throw notFound('That category could not be found.');
    // Include direct children, so "Marquees" shows everything beneath it.
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, cat.id));
    filters.push(inArray(equipment.categoryId, [cat.id, ...children.map((c) => c.id)]));
  }

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(ilike(equipment.name, term), ilike(equipment.summary, term), ilike(equipment.sku, term)),
    );
  }

  if (query.availableFrom && query.availableTo) {
    const from = localDayBounds(query.availableFrom, org.timezone).start;
    const to = localDayBounds(query.availableTo, org.timezone).end;
    const range = toRange(from, to);
    // Serialized: at least one AVAILABLE unit with no overlapping block.
    // Bulk: free quantity greater than zero.
    filters.push(sql`(
      CASE WHEN ${equipment.inventoryMode} = 'SERIALIZED' THEN EXISTS (
        SELECT 1 FROM ${equipmentUnits} u
        WHERE u.equipment_id = ${equipment.id}
          AND u.status = 'AVAILABLE'
          AND NOT EXISTS (
            SELECT 1 FROM ${availabilityBlocks} ab
            WHERE ab.unit_id = u.id AND ab.is_active AND ab.period && ${range}::tstzrange
          )
      )
      ELSE ${equipment.bulkQuantity} > COALESCE((
        SELECT SUM(ab.quantity) FROM ${availabilityBlocks} ab
        WHERE ab.equipment_id = ${equipment.id}
          AND ab.unit_id IS NULL AND ab.is_active AND ab.period && ${range}::tstzrange
      ), 0)
      END
    )`);
  }

  // attr:<definitionId>=<value> filters, ANDed together.
  const attrFilters = [].concat(query.attr ?? []).filter(Boolean);
  for (const raw of attrFilters) {
    const [definitionId, value] = String(raw).split('=');
    if (!definitionId || value == null) continue;
    filters.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(equipmentAttributeValues)
          .where(
            and(
              eq(equipmentAttributeValues.equipmentId, equipment.id),
              eq(equipmentAttributeValues.attributeDefinitionId, definitionId),
              or(
                eq(equipmentAttributeValues.valueText, value),
                sql`${equipmentAttributeValues.valueOptions} ? ${value}`,
                sql`${equipmentAttributeValues.valueNumber}::text = ${value}`,
                sql`${equipmentAttributeValues.valueBool}::text = ${value}`,
              ),
            ),
          ),
      ),
    );
  }

  const where = and(...filters);
  const sortColumn =
    { name: equipment.name, createdAt: equipment.createdAt }[query.sort?.column] ??
    equipment.sortOrder;
  const order = query.sort?.direction === 'desc' ? desc(sortColumn) : asc(sortColumn);

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: equipment.id,
        slug: equipment.slug,
        name: equipment.name,
        summary: equipment.summary,
        sku: equipment.sku,
        categoryId: equipment.categoryId,
        inventoryMode: equipment.inventoryMode,
        bulkQuantity: equipment.bulkQuantity,
        bookingUnit: equipment.bookingUnit,
        bondCents: equipment.bondCents,
        minHireUnits: equipment.minHireUnits,
        minNoticeDays: equipment.minNoticeDays,
        requiresLicence: equipment.requiresLicence,
        requiresTowing: equipment.requiresTowing,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .where(where)
      .orderBy(order, asc(equipment.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(equipment).where(where),
  ]);

  return paginated(await decorate(org, rows, customer), Number(total), query);
}

/** Full detail for the public equipment page. */
export async function getEquipmentBySlug({ org, slug, customer }) {
  const [item] = await db
    .select()
    .from(equipment)
    .where(
      and(
        eq(equipment.organisationId, org.id),
        eq(equipment.slug, slug),
        eq(equipment.status, 'PUBLISHED'),
        isNull(equipment.deletedAt),
      ),
    )
    .limit(1);
  if (!item) throw notFound('That item could not be found.');

  const [media, rates, attributes, related, capacity, category] = await Promise.all([
    db
      .select({
        kind: equipmentMedia.kind,
        storageKey: files.storageKey,
        externalUrl: equipmentMedia.externalUrl,
        altText: equipmentMedia.altText,
        caption: equipmentMedia.caption,
        isPrimary: equipmentMedia.isPrimary,
      })
      .from(equipmentMedia)
      .leftJoin(files, eq(files.id, equipmentMedia.fileId))
      .where(eq(equipmentMedia.equipmentId, item.id))
      .orderBy(desc(equipmentMedia.isPrimary), asc(equipmentMedia.sortOrder)),

    db
      .select()
      .from(equipmentPrices)
      .where(and(eq(equipmentPrices.equipmentId, item.id), eq(equipmentPrices.isActive, true))),

    db
      .select({
        code: attributeDefinitions.code,
        label: attributeDefinitions.label,
        type: attributeDefinitions.type,
        unitLabel: attributeDefinitions.unitLabel,
        valueText: equipmentAttributeValues.valueText,
        valueNumber: equipmentAttributeValues.valueNumber,
        valueBool: equipmentAttributeValues.valueBool,
        valueOptions: equipmentAttributeValues.valueOptions,
        sortOrder: attributeDefinitions.sortOrder,
      })
      .from(equipmentAttributeValues)
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.id, equipmentAttributeValues.attributeDefinitionId),
      )
      .where(eq(equipmentAttributeValues.equipmentId, item.id))
      .orderBy(asc(attributeDefinitions.sortOrder)),

    db
      .select({
        id: equipment.id,
        slug: equipment.slug,
        name: equipment.name,
        summary: equipment.summary,
        bondCents: equipment.bondCents,
        relation: relatedEquipment.relation,
      })
      .from(relatedEquipment)
      .innerJoin(equipment, eq(equipment.id, relatedEquipment.relatedEquipmentId))
      .where(
        and(
          eq(relatedEquipment.equipmentId, item.id),
          eq(equipment.status, 'PUBLISHED'),
          isNull(equipment.deletedAt),
        ),
      )
      .orderBy(asc(relatedEquipment.sortOrder))
      .limit(8),

    totalCapacity(db, item),

    item.categoryId
      ? db
          .select({ id: categories.id, slug: categories.slug, name: categories.name })
          .from(categories)
          .where(eq(categories.id, item.categoryId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const settings = await getSettings(org.id);
  const showPrices = settings['site.showPrices'] !== false;
  const applicable = resolveRates(rates, customer ?? {});

  // Non-blocking: a view counter must never slow a page or fail a request.
  db.update(equipment)
    .set({ viewCount: sql`${equipment.viewCount} + 1` })
    .where(eq(equipment.id, item.id))
    .catch(() => {});

  return {
    ...item,
    category: category[0] ?? null,
    media,
    attributes,
    related: await decorate(org, related, customer),
    capacity,
    pricing: showPrices
      ? {
          rates: applicable.map((r) => ({
            period: r.period,
            amountCents: r.amountCents,
            fromUnit: r.fromUnit,
            maxChargeCents: r.maxChargeCents,
          })),
          bondCents: item.bondCents,
          tier: applicable[0]?.tierKind ?? 'BASE',
        }
      : null,
  };
}

/** The calendar on the equipment page. */
export async function getAvailabilityCalendar({ org, slug, from, to }) {
  const [item] = await db
    .select()
    .from(equipment)
    .where(
      and(
        eq(equipment.organisationId, org.id),
        eq(equipment.slug, slug),
        eq(equipment.status, 'PUBLISHED'),
      ),
    )
    .limit(1);
  if (!item) throw notFound('That item could not be found.');

  const start = localDayBounds(from, org.timezone).start;
  const end = localDayBounds(to, org.timezone).end;

  return {
    equipmentId: item.id,
    slug: item.slug,
    timezone: org.timezone,
    days: await dailyAvailability(db, {
      equipmentItem: item,
      from: start,
      to: end,
      timezone: org.timezone,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listEquipmentForAdmin({ org, query }) {
  const { limit, offset } = toLimitOffset(query);
  const filters = [eq(equipment.organisationId, org.id), isNull(equipment.deletedAt)];
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(or(ilike(equipment.name, term), ilike(equipment.sku, term)));
  }
  if (query.status) filters.push(eq(equipment.status, query.status));
  const where = and(...filters);

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: equipment.id,
        slug: equipment.slug,
        name: equipment.name,
        sku: equipment.sku,
        status: equipment.status,
        inventoryMode: equipment.inventoryMode,
        bulkQuantity: equipment.bulkQuantity,
        bondCents: equipment.bondCents,
        categoryId: equipment.categoryId,
        updatedAt: equipment.updatedAt,
        unitCount: sql`(
          SELECT count(*) FROM ${equipmentUnits} u WHERE u.equipment_id = ${equipment.id}
        )::int`,
      })
      .from(equipment)
      .where(where)
      .orderBy(asc(equipment.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(equipment).where(where),
  ]);

  return paginated(rows, Number(total), query);
}

/** Everything the edit screen needs, in one call. */
export async function getEquipmentForAdmin({ org, equipmentId }) {
  const [item] = await db
    .select()
    .from(equipment)
    .where(
      and(
        eq(equipment.id, equipmentId),
        eq(equipment.organisationId, org.id),
        isNull(equipment.deletedAt),
      ),
    )
    .limit(1);
  if (!item) throw notFound('That item could not be found.');

  const [prices, attributes, units, blocks] = await Promise.all([
    db
      .select()
      .from(equipmentPrices)
      .where(eq(equipmentPrices.equipmentId, item.id))
      .orderBy(asc(equipmentPrices.tierKind), asc(equipmentPrices.fromUnit)),
    db
      .select()
      .from(equipmentAttributeValues)
      .where(eq(equipmentAttributeValues.equipmentId, item.id)),
    listUnits({ org, equipmentId: item.id }),
    db
      .select({
        id: availabilityBlocks.id,
        unitId: availabilityBlocks.unitId,
        quantity: availabilityBlocks.quantity,
        reason: availabilityBlocks.reason,
        note: availabilityBlocks.note,
        startAt: sql`lower(${availabilityBlocks.period})`,
        endAt: sql`upper(${availabilityBlocks.period})`,
      })
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.equipmentId, item.id),
          eq(availabilityBlocks.isActive, true),
          ne(availabilityBlocks.reason, 'BOOKING'),
          sql`upper(${availabilityBlocks.period}) > now()`,
        ),
      )
      .orderBy(sql`lower(${availabilityBlocks.period})`),
  ]);

  return { ...item, prices, attributes, units, blocks };
}

export async function createEquipment({ org, input }) {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, org.id, input.slug ?? slugify(input.name));
    const [item] = await tx
      .insert(equipment)
      .values({
        organisationId: org.id,
        ...stripAttributes(input),
        slug,
        publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      })
      .returning();

    if (input.attributes?.length) await writeAttributes(tx, item.id, input.attributes);
    return item;
  });
}

export async function updateEquipment({ org, equipmentId, input }) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(equipment)
      .where(and(eq(equipment.id, equipmentId), eq(equipment.organisationId, org.id)))
      .limit(1);
    if (!existing) throw notFound('That item could not be found.');

    const slug =
      input.slug && input.slug !== existing.slug
        ? await uniqueSlug(tx, org.id, input.slug, equipmentId)
        : existing.slug;

    const [item] = await tx
      .update(equipment)
      .set({
        ...stripAttributes(input),
        slug,
        publishedAt:
          input.status === 'PUBLISHED' && !existing.publishedAt ? new Date() : existing.publishedAt,
      })
      .where(eq(equipment.id, equipmentId))
      .returning();

    if (input.attributes) {
      await tx
        .delete(equipmentAttributeValues)
        .where(eq(equipmentAttributeValues.equipmentId, equipmentId));
      if (input.attributes.length) await writeAttributes(tx, equipmentId, input.attributes);
    }
    return item;
  });
}

/**
 * Archive rather than delete when the item has history.
 *
 * A hard delete would orphan booking line items, and the organisation's past
 * invoices have to keep making sense. Only an item that has never been booked
 * is actually removed.
 */
export async function archiveEquipment({ org, equipmentId }) {
  return db.transaction(async (tx) => {
    const [{ bookingCount } = { bookingCount: 0 }] = await tx
      .select({ bookingCount: count() })
      .from(bookingItems)
      .where(eq(bookingItems.equipmentId, equipmentId));

    if (Number(bookingCount) > 0) {
      const [item] = await tx
        .update(equipment)
        .set({ status: 'ARCHIVED' })
        .where(and(eq(equipment.id, equipmentId), eq(equipment.organisationId, org.id)))
        .returning();
      return { archived: true, deleted: false, item };
    }

    await tx
      .update(equipment)
      .set({ deletedAt: new Date(), status: 'ARCHIVED' })
      .where(and(eq(equipment.id, equipmentId), eq(equipment.organisationId, org.id)));
    return { archived: true, deleted: true };
  });
}

/** Replace the rate card for an item in one transaction. */
export async function replacePrices({ org, equipmentId, rates }) {
  return db.transaction(async (tx) => {
    await tx.delete(equipmentPrices).where(eq(equipmentPrices.equipmentId, equipmentId));
    if (!rates.length) return [];
    return tx
      .insert(equipmentPrices)
      .values(
        rates.map((r) => ({
          organisationId: org.id,
          equipmentId,
          tierKind: r.tierKind,
          customerTypeId: r.customerTypeId ?? null,
          period: r.period,
          amountCents: r.amountCents,
          fromUnit: r.fromUnit,
          maxChargeCents: r.maxChargeCents ?? null,
          isActive: r.isActive,
        })),
      )
      .returning();
  });
}

export async function addUnit({ org, equipmentId, input }) {
  const [unit] = await db
    .insert(equipmentUnits)
    .values({
      organisationId: org.id,
      equipmentId,
      assetTag: input.assetTag,
      serialNumber: input.serialNumber ?? null,
      locationId: input.locationId ?? null,
      status: input.status,
      condition: input.condition,
      purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
      purchaseCostCents: input.purchaseCostCents ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return unit;
}

export async function listUnits({ org, equipmentId }) {
  return db
    .select()
    .from(equipmentUnits)
    .where(
      and(
        eq(equipmentUnits.organisationId, org.id),
        equipmentId ? eq(equipmentUnits.equipmentId, equipmentId) : undefined,
      ),
    )
    .orderBy(asc(equipmentUnits.assetTag));
}

/** Staff-created block: maintenance, a closure, an internal event. */
export async function blockDates({ org, input, actor }) {
  const [block] = await db
    .insert(availabilityBlocks)
    .values({
      organisationId: org.id,
      equipmentId: input.equipmentId,
      unitId: input.unitId ?? null,
      quantity: input.unitId ? 1 : input.quantity,
      period: toRange(new Date(input.from), new Date(input.to)),
      reason: input.reason,
      note: input.note ?? null,
      createdBy: actor.userId,
    })
    .returning();
  return block;
}

export async function removeBlock({ org, blockId }) {
  const [block] = await db
    .update(availabilityBlocks)
    .set({ isActive: false })
    .where(
      and(
        eq(availabilityBlocks.id, blockId),
        eq(availabilityBlocks.organisationId, org.id),
        // A booking's hold is released by cancelling the booking, not by
        // deleting the block — otherwise the two would disagree.
        ne(availabilityBlocks.reason, 'BOOKING'),
      ),
    )
    .returning();
  if (!block) throw notFound('That block could not be found, or it belongs to a booking.');
  return block;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const stripAttributes = ({ attributes: _a, ...rest }) => rest;

async function uniqueSlug(tx, organisationId, base, excludeId) {
  let candidate = base || 'item';
  for (let n = 1; n < 50; n += 1) {
    const [clash] = await tx
      .select({ id: equipment.id })
      .from(equipment)
      .where(and(eq(equipment.organisationId, organisationId), eq(equipment.slug, candidate)))
      .limit(1);
    if (!clash || clash.id === excludeId) return candidate;
    candidate = `${base}-${n + 1}`;
  }
  return `${base}-${Date.now()}`;
}

async function writeAttributes(tx, equipmentId, attributes) {
  await tx.insert(equipmentAttributeValues).values(
    attributes.map((a) => ({
      equipmentId,
      attributeDefinitionId: a.attributeDefinitionId,
      valueText: a.valueText ?? null,
      valueNumber: a.valueNumber ?? null,
      valueBool: a.valueBool ?? null,
      valueOptions: a.valueOptions ?? null,
    })),
  );
}
