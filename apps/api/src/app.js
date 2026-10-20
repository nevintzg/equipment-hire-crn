import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { isProduction } from '#src/config/env.js';
import { requestContext } from '#src/middleware/request-context.js';
import { resolveTenant, isAllowedOrigin } from '#src/middleware/tenant.js';
import { errorHandler, notFoundHandler } from '#src/middleware/error-handler.js';
import { globalLimiter } from '#src/middleware/rate-limit.js';

import { createHealthRouter } from '#src/modules/health/health.routes.js';
import {
  createWebhookRouter,
  createAdminPaymentsRouter,
} from '#src/modules/payments/payments.routes.js';
import { createAuthRouter } from '#src/modules/auth/auth.routes.js';
import { createSiteRouter } from '#src/modules/site/site.routes.js';
import { createMeRouter } from '#src/modules/me/me.routes.js';
import { createEquipmentRouter } from '#src/modules/equipment/equipment.routes.js';
import { createBookingsRouter } from '#src/modules/bookings/bookings.routes.js';
import { createAdminBookingsRouter } from '#src/modules/bookings/bookings.admin.routes.js';
import {
  createAdminAvailabilityRouter,
  createAdminEquipmentRouter,
} from '#src/modules/equipment/equipment.admin.routes.js';
import { createAdminSettingsRouter } from '#src/modules/settings/settings.admin.routes.js';
import { createAdminStorageRouter } from '#src/modules/storage/storage.routes.js';
import { createCronRouter } from '#src/modules/cron/cron.routes.js';
import { createAdminRouter } from '#src/modules/admin/admin.routes.js';

/**
 * Builds the Express app. Kept separate from server.js so tests can mount it
 * with supertest without binding a port.
 *
 * Middleware order is load-bearing. Reading top to bottom is the request's
 * actual journey, and three positions in particular are not interchangeable:
 *
 *   1. The Stripe webhook is mounted BEFORE express.json(), because signature
 *      verification needs the raw bytes.
 *   2. Tenant resolution runs before any router that reads req.org.
 *   3. The error handler is registered last, because Express only recognises
 *      an error handler by its four-argument signature at the end of the stack.
 */
export function createApp() {
  const app = express();

  // Behind exactly one proxy (the host's load balancer), so req.ip is the real
  // client. Trusting every hop would let a client spoof its address and defeat
  // the rate limiter.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use(requestContext);

  app.use(
    helmet({
      // The API serves JSON, not pages; a restrictive CSP here protects the
      // error pages and nothing else, but costs nothing.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.use(
    cors({
      // Async origin check: each tenant's own hostname is allowed, which a
      // static list cannot express.
      origin: (origin, callback) => {
        isAllowedOrigin(origin)
          .then((ok) => callback(ok ? null : new Error('CORS_NOT_ALLOWED'), ok))
          .catch(() => callback(new Error('CORS_NOT_ALLOWED'), false));
      },
      credentials: true, // the refresh cookie
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86_400, // cache the preflight for a day
    }),
  );

  // (1) Health first: no tenant, no body parsing, no database.
  app.use(createHealthRouter());

  // (2) Stripe webhook before the JSON parser.
  app.use('/api/v1/webhooks', resolveTenant, createWebhookRouter());

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  // The scheduled tick authenticates with its own shared secret, and runs
  // across all organisations, so it sits outside tenant resolution.
  app.use('/api/v1/internal/cron', createCronRouter());

  // (3) Everything below is tenant-scoped.
  app.use('/api/v1', resolveTenant);

  // ── Customer site ─────────────────────────────────────────────────────────
  app.use('/api/v1/auth', createAuthRouter('web'));
  app.use('/api/v1/site', createSiteRouter());
  app.use('/api/v1/equipment', createEquipmentRouter());
  app.use('/api/v1/bookings', createBookingsRouter());
  app.use('/api/v1/me', createMeRouter());

  // ── Admin panel ───────────────────────────────────────────────────────────
  app.use('/api/v1/admin/auth', createAuthRouter('admin'));
  app.use('/api/v1/admin/bookings', createAdminBookingsRouter());
  app.use('/api/v1/admin/equipment', createAdminEquipmentRouter());
  app.use('/api/v1/admin/availability', createAdminAvailabilityRouter());
  app.use('/api/v1/admin/settings', createAdminSettingsRouter());
  app.use('/api/v1/admin/payments', createAdminPaymentsRouter());
  app.use('/api/v1/admin/files', createAdminStorageRouter());
  app.use('/api/v1/admin', createAdminRouter());

  // Lets the frontends discover the API without a hard-coded route list.
  app.get('/api/v1', (req, res) => {
    res.json({
      data: {
        name: 'Community Equipment Hire API',
        version: 'v1',
        organisation: { slug: req.org?.slug, name: req.org?.name, timezone: req.org?.timezone },
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
