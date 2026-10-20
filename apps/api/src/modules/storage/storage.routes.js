import { Router } from 'express';
import { authenticate, requireAnyPermission } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { confirmUploadSchema, uploadUrlSchema } from './storage.schemas.js';
import * as service from './storage.service.js';

/**
 * Upload signing. Staff only — a customer never needs to upload anything in
 * this product, so the attack surface stays closed.
 */
export function createAdminStorageRouter() {
  const router = Router();
  router.use(authenticate('admin'));
  router.use(
    requireAnyPermission('equipment.edit', 'content.manage', 'booking.inspect', 'settings.manage'),
  );

  router.post('/upload-url', validate({ body: uploadUrlSchema }), async (req, res) => {
    const result = await service.createUploadUrl({
      org: req.org,
      actor: req.auth,
      input: req.valid.body,
    });
    res.status(201).json({ data: result });
  });

  router.post('/:id/confirm', validate({ body: confirmUploadSchema }), async (req, res) => {
    const file = await service.confirmUpload({
      org: req.org,
      fileId: req.params.id,
      dimensions: req.valid.body,
    });
    res.json({ data: file });
  });

  router.delete('/:id', async (req, res) => {
    res.json({ data: await service.deleteFile({ org: req.org, fileId: req.params.id }) });
  });

  return router;
}
