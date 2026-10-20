import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#src/db/client.js';
import {
  autoApprovalRules,
  cancellationTiers,
  customerTypes,
  emailTemplates,
  termsVersions,
} from '#src/db/schema/index.js';
import { authenticate, requirePermission } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { auditAction } from '#src/modules/audit/audit.service.js';
import {
  updateSettingsSchema,
  upsertAutoApprovalRuleSchema,
  upsertCancellationTierSchema,
} from './settings.schemas.js';
import * as service from './settings.service.js';
import { notFound } from '#src/lib/errors.js';

export function createAdminSettingsRouter() {
  const router = Router();
  router.use(authenticate('admin'));

  router.get('/', requirePermission('settings.view'), async (req, res) => {
    res.json({ data: await service.getSettingsForAdmin(req.org.id) });
  });

  router.patch(
    '/',
    requirePermission('settings.manage'),
    validate({ body: updateSettingsSchema }),
    auditAction('settings.update', 'settings'),
    async (req, res) => {
      const updated = await service.updateSettings(
        req.org.id,
        req.valid.body.settings,
        req.auth.userId,
      );
      res.json({ data: updated });
    },
  );

  // ── Cancellation policy ───────────────────────────────────────────────────
  router.get('/cancellation-tiers', requirePermission('settings.view'), async (req, res) => {
    const rows = await db
      .select()
      .from(cancellationTiers)
      .where(eq(cancellationTiers.organisationId, req.org.id))
      .orderBy(asc(cancellationTiers.minHoursBefore));
    res.json({ data: rows });
  });

  router.put(
    '/cancellation-tiers',
    requirePermission('settings.manage'),
    validate({ body: z.object({ tiers: z.array(upsertCancellationTierSchema).max(10) }) }),
    auditAction('settings.cancellation_tiers.update', 'cancellation_tier'),
    async (req, res) => {
      // Replace wholesale: the policy is a schedule, and editing one band in
      // isolation is how you end up with gaps or overlaps.
      const rows = await db.transaction(async (tx) => {
        await tx.delete(cancellationTiers).where(eq(cancellationTiers.organisationId, req.org.id));
        if (!req.valid.body.tiers.length) return [];
        return tx
          .insert(cancellationTiers)
          .values(req.valid.body.tiers.map((t) => ({ ...t, organisationId: req.org.id })))
          .returning();
      });
      res.json({ data: rows });
    },
  );

  // ── Auto-approval rules ───────────────────────────────────────────────────
  router.get('/auto-approval', requirePermission('settings.view'), async (req, res) => {
    const rows = await db
      .select()
      .from(autoApprovalRules)
      .where(eq(autoApprovalRules.organisationId, req.org.id))
      .orderBy(asc(autoApprovalRules.priority));
    res.json({ data: rows });
  });

  router.post(
    '/auto-approval',
    requirePermission('settings.manage'),
    validate({ body: upsertAutoApprovalRuleSchema }),
    auditAction('settings.auto_approval.create', 'auto_approval_rule'),
    async (req, res) => {
      const [row] = await db
        .insert(autoApprovalRules)
        .values({ ...req.valid.body, organisationId: req.org.id })
        .returning();
      res.status(201).json({ data: row });
    },
  );

  router.put(
    '/auto-approval/:id',
    requirePermission('settings.manage'),
    validate({ body: upsertAutoApprovalRuleSchema }),
    auditAction('settings.auto_approval.update', 'auto_approval_rule'),
    async (req, res) => {
      const [row] = await db
        .update(autoApprovalRules)
        .set(req.valid.body)
        .where(
          and(
            eq(autoApprovalRules.id, req.params.id),
            eq(autoApprovalRules.organisationId, req.org.id),
          ),
        )
        .returning();
      if (!row) throw notFound('That rule could not be found.');
      res.json({ data: row });
    },
  );

  router.delete(
    '/auto-approval/:id',
    requirePermission('settings.manage'),
    auditAction('settings.auto_approval.delete', 'auto_approval_rule'),
    async (req, res) => {
      await db
        .delete(autoApprovalRules)
        .where(
          and(
            eq(autoApprovalRules.id, req.params.id),
            eq(autoApprovalRules.organisationId, req.org.id),
          ),
        );
      res.status(204).end();
    },
  );

  // ── Customer types ────────────────────────────────────────────────────────
  router.get('/customer-types', requirePermission('settings.view'), async (req, res) => {
    const rows = await db
      .select()
      .from(customerTypes)
      .where(eq(customerTypes.organisationId, req.org.id))
      .orderBy(asc(customerTypes.sortOrder));
    res.json({ data: rows });
  });

  // ── Terms and conditions ──────────────────────────────────────────────────
  router.get('/terms', requirePermission('settings.view'), async (req, res) => {
    const rows = await db
      .select()
      .from(termsVersions)
      .where(eq(termsVersions.organisationId, req.org.id))
      .orderBy(asc(termsVersions.version));
    res.json({ data: rows });
  });

  /**
   * Publishing terms creates a new version and makes it current; it never
   * edits a published one. Bookings point at the exact version their customer
   * accepted, so rewriting history would make past agreements unprovable.
   */
  router.post(
    '/terms',
    requirePermission('terms.manage'),
    validate({
      body: z.object({
        title: z.string().trim().min(1).max(200),
        bodyMarkdown: z.string().min(1).max(100_000),
        makeCurrent: z.boolean().default(true),
      }),
    }),
    auditAction('settings.terms.publish', 'terms_version'),
    async (req, res) => {
      const row = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ version: termsVersions.version })
          .from(termsVersions)
          .where(eq(termsVersions.organisationId, req.org.id));
        const nextVersion = Math.max(0, ...existing.map((e) => e.version)) + 1;

        if (req.valid.body.makeCurrent) {
          // Clear the flag first: a partial unique index allows only one
          // current version per organisation.
          await tx
            .update(termsVersions)
            .set({ isCurrent: false })
            .where(
              and(eq(termsVersions.organisationId, req.org.id), eq(termsVersions.isCurrent, true)),
            );
        }

        const [created] = await tx
          .insert(termsVersions)
          .values({
            organisationId: req.org.id,
            version: nextVersion,
            title: req.valid.body.title,
            bodyMarkdown: req.valid.body.bodyMarkdown,
            isCurrent: req.valid.body.makeCurrent,
            publishedAt: req.valid.body.makeCurrent ? new Date() : null,
            createdBy: req.auth.userId,
          })
          .returning();
        return created;
      });
      res.status(201).json({ data: row });
    },
  );

  // ── Email templates ───────────────────────────────────────────────────────
  router.get('/email-templates', requirePermission('email.manage'), async (req, res) => {
    const rows = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.organisationId, req.org.id))
      .orderBy(asc(emailTemplates.code));
    res.json({ data: rows });
  });

  router.put(
    '/email-templates/:code',
    requirePermission('email.manage'),
    validate({
      body: z.object({
        subject: z.string().trim().min(1).max(200),
        bodyMarkdown: z.string().min(1).max(50_000),
        isActive: z.boolean().default(true),
      }),
    }),
    auditAction('settings.email_template.update', 'email_template'),
    async (req, res) => {
      const [row] = await db
        .update(emailTemplates)
        .set({ ...req.valid.body, updatedBy: req.auth.userId })
        .where(
          and(
            eq(emailTemplates.organisationId, req.org.id),
            eq(emailTemplates.code, req.params.code),
          ),
        )
        .returning();
      if (!row) throw notFound('That template could not be found.');
      res.json({ data: row });
    },
  );

  return router;
}
