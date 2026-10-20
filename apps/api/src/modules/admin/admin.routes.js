import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { auditAction } from '#src/modules/audit/audit.service.js';
import { paginationSchema } from '#src/lib/pagination.js';
import * as service from './admin.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

/** Dashboard, calendar, customers, enquiries and categories for the admin panel. */
export function createAdminRouter() {
  const router = Router();
  router.use(authenticate('admin'));

  router.get('/dashboard', requirePermission('booking.view'), async (req, res) => {
    res.json({ data: await service.getDashboard({ org: req.org }) });
  });

  router.get(
    '/calendar',
    requirePermission('booking.view'),
    validate({ query: z.object({ from: isoDate, to: isoDate }) }),
    async (req, res) => {
      res.json({ data: await service.bookingsInWindow({ org: req.org, ...req.valid.query }) });
    },
  );

  // ── Customers ─────────────────────────────────────────────────────────────
  router.get(
    '/customers',
    requirePermission('customer.view'),
    validate({
      query: paginationSchema.extend({
        search: z.string().trim().max(120).optional(),
        filter: z.enum(['UNCONFIRMED_TYPE', 'BLOCKED']).optional(),
      }),
    }),
    async (req, res) => {
      res.json(await service.listCustomers({ org: req.org, query: req.valid.query }));
    },
  );

  router.get('/customers/:id', requirePermission('customer.view'), async (req, res) => {
    res.json({ data: await service.getCustomer({ org: req.org, customerId: req.params.id }) });
  });

  router.patch(
    '/customers/:id',
    requirePermission('customer.edit'),
    validate({
      body: z.object({
        customerTypeId: z.uuid().nullable().optional(),
        confirmCustomerType: z.boolean().optional(),
        staffNotes: z.string().max(5000).nullable().optional(),
        blocked: z.boolean().optional(),
        blockedReason: z.string().trim().max(500).optional(),
      }),
    }),
    // Confirming a type changes what a customer pays, and blocking locks them
    // out, so both need their own permission on top of customer.edit.
    (req, res, next) => {
      const b = req.valid.body;
      const extra = [];
      if (b.confirmCustomerType !== undefined || b.customerTypeId !== undefined) {
        extra.push('customer.verify');
      }
      if (b.blocked !== undefined) extra.push('customer.block');
      return extra.length ? requirePermission(...extra)(req, res, next) : next();
    },
    auditAction('customer.update', 'user'),
    async (req, res) => {
      res.json({
        data: await service.updateCustomer({
          org: req.org,
          customerId: req.params.id,
          input: req.valid.body,
          actor: req.auth,
        }),
      });
    },
  );

  // ── Enquiries ─────────────────────────────────────────────────────────────
  router.get(
    '/enquiries',
    requirePermission('enquiry.manage'),
    validate({
      query: paginationSchema.extend({ status: z.enum(['OPEN', 'HANDLED']).optional() }),
    }),
    async (req, res) => {
      res.json(await service.listEnquiries({ org: req.org, query: req.valid.query }));
    },
  );

  router.patch(
    '/enquiries/:id',
    requirePermission('enquiry.manage'),
    validate({
      body: z.object({ handled: z.boolean(), staffNotes: z.string().max(5000).optional() }),
    }),
    async (req, res) => {
      res.json({
        data: await service.updateEnquiry({
          org: req.org,
          enquiryId: req.params.id,
          input: req.valid.body,
          actor: req.auth,
        }),
      });
    },
  );

  // ── Categories ────────────────────────────────────────────────────────────
  const categorySchema = z.object({
    name: z.string().trim().min(1, 'Give the category a name').max(120),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens')
      .max(80)
      .optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    parentId: z.uuid().nullable().optional(),
    imageFileId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    isActive: z.boolean().default(true),
  });

  router.get('/categories', requirePermission('equipment.view'), async (req, res) => {
    res.json({ data: await service.listCategories({ org: req.org }) });
  });

  router.post(
    '/categories',
    requirePermission('category.manage'),
    validate({ body: categorySchema }),
    auditAction('category.create', 'category'),
    async (req, res) => {
      res
        .status(201)
        .json({ data: await service.saveCategory({ org: req.org, input: req.valid.body }) });
    },
  );

  router.put(
    '/categories/:id',
    requirePermission('category.manage'),
    validate({ body: categorySchema }),
    auditAction('category.update', 'category'),
    async (req, res) => {
      res.json({
        data: await service.saveCategory({
          org: req.org,
          categoryId: req.params.id,
          input: req.valid.body,
        }),
      });
    },
  );

  router.delete(
    '/categories/:id',
    requirePermission('category.manage'),
    auditAction('category.deactivate', 'category'),
    async (req, res) => {
      res.json({
        data: await service.deactivateCategory({ org: req.org, categoryId: req.params.id }),
      });
    },
  );

  return router;
}
