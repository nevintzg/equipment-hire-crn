import { Router } from 'express';
import { pingDatabase } from '#src/db/client.js';
import { env } from '#src/config/env.js';

/**
 * Health endpoints.
 *
 * The split matters on this hosting setup. The platform's health check runs
 * every 30 seconds forever. If that check touched the database, it would keep
 * the database awake around the clock and burn the entire free compute
 * allowance on checking that the database is awake.
 *
 *   /health  process is up. No database, no dependencies, always cheap.
 *   /ready   actually usable. Hits the database; for deploys and debugging.
 */
export function createHealthRouter() {
  const router = Router();
  const startedAt = Date.now();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      environment: env.NODE_ENV,
    });
  });

  router.get('/ready', async (_req, res) => {
    const checks = {};
    let healthy = true;

    const started = Date.now();
    try {
      await pingDatabase();
      checks.database = { ok: true, ms: Date.now() - started };
    } catch (err) {
      healthy = false;
      // The first request after the database scales to zero can take seconds;
      // the message distinguishes "cold" from "broken".
      checks.database = { ok: false, ms: Date.now() - started, error: String(err?.message ?? err) };
    }

    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ready' : 'degraded', checks });
  });

  return router;
}
