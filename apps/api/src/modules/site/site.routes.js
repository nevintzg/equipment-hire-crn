import { Router } from 'express';
import { z } from 'zod';
import { db } from '#src/db/client.js';
import { contactEnquiries, customerTypes } from '#src/db/schema/index.js';
import { and, asc, eq } from 'drizzle-orm';
import { validate } from '#src/middleware/validate.js';
import { publicFormLimiter } from '#src/middleware/rate-limit.js';
import { enqueueEmail, dispatchOutboxSoon } from '#src/modules/notifications/outbox.service.js';
import { staffRecipients } from '#src/modules/notifications/recipients.js';
import { authenticate } from '#src/middleware/auth.js';
import * as service from './site.service.js';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid email address'),
  phone: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10, 'Please give us a little more detail').max(4000),
});

/** Public, unauthenticated content routes. */
export function createSiteRouter() {
  const router = Router();

  /** Everything the frontend needs on boot. */
  router.get('/', async (req, res) => {
    // Short cache: branding changes rarely, and this is the most-hit endpoint.
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ data: await service.getPublicSite(req.org) });
  });

  router.get('/home', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: await service.getHomeSections(req.org) });
  });

  router.get('/terms', async (req, res) => {
    res.json({ data: await service.getCurrentTerms(req.org) });
  });

  router.get('/booking-questions', async (req, res) => {
    res.json({ data: await service.getBookingQuestions(req.org) });
  });

  router.get('/customer-types', async (req, res) => {
    const rows = await db
      .select({
        id: customerTypes.id,
        code: customerTypes.code,
        name: customerTypes.name,
        description: customerTypes.description,
        requiresVerification: customerTypes.requiresVerification,
      })
      .from(customerTypes)
      .where(and(eq(customerTypes.organisationId, req.org.id), eq(customerTypes.isActive, true)))
      .orderBy(asc(customerTypes.sortOrder));
    res.json({ data: rows });
  });

  router.get('/locations/:id/slots', async (req, res) => {
    res.json({ data: await service.getLocationSlots(req.org, req.params.id) });
  });

  router.post(
    '/contact',
    publicFormLimiter,
    authenticate('web', { optional: true }),
    validate({ body: contactSchema }),
    async (req, res) => {
      const input = req.valid.body;

      await db.transaction(async (tx) => {
        const [enquiry] = await tx
          .insert(contactEnquiries)
          .values({
            organisationId: req.org.id,
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            subject: input.subject ?? null,
            message: input.message,
            userId: req.auth?.userId ?? null,
            ipAddress: req.ip ?? null,
          })
          .returning({ id: contactEnquiries.id });

        // Stored first, emailed second — an enquiry is never lost to a mail
        // outage, which for a volunteer organisation means a lost booking.
        for (const staff of await staffRecipients(
          req.org.id,
          'enquiry.manage',
          'staff.contact_enquiry',
          tx,
        )) {
          await enqueueEmail(tx, {
            organisationId: req.org.id,
            templateCode: 'staff.contact_enquiry',
            toEmail: staff.email,
            toName: staff.firstName,
            variables: {
              name: input.name,
              email: input.email,
              phone: input.phone ?? '—',
              subjectLine: input.subject ?? 'Website enquiry',
              message: input.message,
              enquiryId: enquiry.id,
            },
          });
        }
      });

      dispatchOutboxSoon();
      res.status(201).json({ data: { message: 'Thanks — we will be in touch soon.' } });
    },
  );

  /** CMS page by slug. Last, so it cannot shadow the routes above. */
  router.get('/pages/:slug', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=120');
    res.json({ data: await service.getPublishedPage(req.org, req.params.slug) });
  });

  return router;
}
