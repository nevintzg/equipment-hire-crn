import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { auditAction } from '#src/modules/audit/audit.service.js';
import { paginationSchema } from '#src/lib/pagination.js';
import {
  blockDatesSchema,
  upsertEquipmentSchema,
  upsertPriceSchema,
  upsertUnitSchema,
} from './equipment.schemas.js';
import * as service from './equipment.service.js';

/** Staff catalogue and inventory management. */
export function createAdminEquipmentRouter() {
  const router = Router();
  router.use(authenticate('admin'));

  router.get(
    '/',
    requirePermission('equipment.view'),
    validate({
      query: paginationSchema.extend({
        search: z.string().trim().max(120).optional(),
        status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      }),
    }),
    async (req, res) => {
      res.json(await service.listEquipmentForAdmin({ org: req.org, query: req.valid.query }));
    },
  );

  router.get('/:id', requirePermission('equipment.view'), async (req, res) => {
    res.json({
      data: await service.getEquipmentForAdmin({ org: req.org, equipmentId: req.params.id }),
    });
  });

  router.post(
    '/',
    requirePermission('equipment.create'),
    validate({ body: upsertEquipmentSchema }),
    auditAction('equipment.create', 'equipment'),
    async (req, res) => {
      const item = await service.createEquipment({ org: req.org, input: req.valid.body });
      res.status(201).json({ data: item });
    },
  );

  router.put(
    '/:id',
    requirePermission('equipment.edit'),
    validate({ body: upsertEquipmentSchema }),
    auditAction('equipment.update', 'equipment'),
    async (req, res) => {
      const item = await service.updateEquipment({
        org: req.org,
        equipmentId: req.params.id,
        input: req.valid.body,
      });
      res.json({ data: item });
    },
  );

  router.delete(
    '/:id',
    requirePermission('equipment.delete'),
    auditAction('equipment.archive', 'equipment'),
    async (req, res) => {
      res.json({
        data: await service.archiveEquipment({ org: req.org, equipmentId: req.params.id }),
      });
    },
  );

  /** Replace the whole rate card in one call — the pricing screen saves all rows. */
  router.put(
    '/:id/prices',
    requirePermission('equipment.edit'),
    validate({ body: z.object({ rates: z.array(upsertPriceSchema).max(40) }) }),
    auditAction('equipment.prices.update', 'equipment'),
    async (req, res) => {
      const rates = await service.replacePrices({
        org: req.org,
        equipmentId: req.params.id,
        rates: req.valid.body.rates,
      });
      res.json({ data: rates });
    },
  );

  router.get('/:id/units', requirePermission('inventory.view'), async (req, res) => {
    res.json({ data: await service.listUnits({ org: req.org, equipmentId: req.params.id }) });
  });

  router.post(
    '/:id/units',
    requirePermission('inventory.manage'),
    validate({ body: upsertUnitSchema }),
    auditAction('unit.create', 'equipment_unit'),
    async (req, res) => {
      const unit = await service.addUnit({
        org: req.org,
        equipmentId: req.params.id,
        input: req.valid.body,
      });
      res.status(201).json({ data: unit });
    },
  );

  return router;
}

/** Availability blocks live under their own path, since they span equipment. */
export function createAdminAvailabilityRouter() {
  const router = Router();
  router.use(authenticate('admin'));

  router.post(
    '/blocks',
    requirePermission('availability.manage'),
    validate({ body: blockDatesSchema }),
    auditAction('availability.block', 'availability_block'),
    async (req, res) => {
      const block = await service.blockDates({
        org: req.org,
        input: req.valid.body,
        actor: req.auth,
      });
      res.status(201).json({ data: block });
    },
  );

  router.delete(
    '/blocks/:id',
    requirePermission('availability.manage'),
    auditAction('availability.unblock', 'availability_block'),
    async (req, res) => {
      res.json({ data: await service.removeBlock({ org: req.org, blockId: req.params.id }) });
    },
  );

  return router;
}
