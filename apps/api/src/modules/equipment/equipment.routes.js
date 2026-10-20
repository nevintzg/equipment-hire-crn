import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { attributeDefinitions, categories } from '#src/db/schema/index.js';
import { authenticate } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { availabilityQuerySchema, browseQuerySchema } from './equipment.schemas.js';
import * as service from './equipment.service.js';

/**
 * Public catalogue.
 *
 * Authentication is optional throughout: a visitor can browse, but a signed-in
 * customer with a confirmed type sees their own rates. That is why every
 * handler passes a `customer` through to pricing rather than assuming base
 * prices.
 */
export function createEquipmentRouter() {
  const router = Router();
  router.use(authenticate('web', { optional: true }));

  const customerOf = (req) =>
    req.auth
      ? {
          customerTypeId: req.auth.user.customerTypeId,
          customerTypeConfirmed: Boolean(req.auth.user.customerTypeConfirmedAt),
        }
      : {};

  router.get('/', validate({ query: browseQuerySchema }), async (req, res) => {
    const result = await service.browseEquipment({
      org: req.org,
      query: req.valid.query,
      customer: customerOf(req),
    });
    // Private, because the prices depend on who is asking.
    res.set('Cache-Control', req.auth ? 'private, max-age=30' : 'public, max-age=60');
    res.json(result);
  });

  router.get('/categories', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    const rows = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        parentId: categories.parentId,
        imageFileId: categories.imageFileId,
      })
      .from(categories)
      .where(and(eq(categories.organisationId, req.org.id), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    res.json({ data: rows });
  });

  /** Filterable attributes, so the frontend can render the filter sidebar. */
  router.get('/filters', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    const rows = await db
      .select({
        id: attributeDefinitions.id,
        code: attributeDefinitions.code,
        label: attributeDefinitions.label,
        type: attributeDefinitions.type,
        unitLabel: attributeDefinitions.unitLabel,
        options: attributeDefinitions.options,
      })
      .from(attributeDefinitions)
      .where(
        and(
          eq(attributeDefinitions.organisationId, req.org.id),
          eq(attributeDefinitions.isFilterable, true),
        ),
      )
      .orderBy(asc(attributeDefinitions.sortOrder));
    res.json({ data: rows });
  });

  router.get('/:slug', async (req, res) => {
    const item = await service.getEquipmentBySlug({
      org: req.org,
      slug: req.params.slug,
      customer: customerOf(req),
    });
    res.json({ data: item });
  });

  router.get(
    '/:slug/availability',
    validate({ query: availabilityQuerySchema }),
    async (req, res) => {
      const result = await service.getAvailabilityCalendar({
        org: req.org,
        slug: req.params.slug,
        from: req.valid.query.from,
        to: req.valid.query.to,
      });
      // Deliberately short: availability is the one thing that must not be stale.
      res.set('Cache-Control', 'private, max-age=15');
      res.json({ data: result });
    },
  );

  return router;
}
