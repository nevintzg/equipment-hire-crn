import { Router } from 'express';
import { LOCKS, withAdvisoryLock } from '#src/db/client.js';
import { env } from '#src/config/env.js';
import { safeEqual } from '#src/lib/tokens.js';
import { forbidden } from '#src/lib/errors.js';
import { childLogger } from '#src/config/logger.js';
import { flushOutbox } from '#src/modules/notifications/outbox.service.js';
import {
  expireUnpaidApprovals,
  flagOverdueReturns,
} from '#src/modules/bookings/bookings.service.js';
import { processPendingRefunds } from '#src/modules/payments/payments.service.js';
import { pruneExpiredAuthRows } from '#src/modules/auth/auth.service.js';

const log = childLogger('cron');

/**
 * The scheduled tick.
 *
 * This endpoint is the entire background-job system. It replaces a worker
 * process and a Redis queue, which this architecture cannot afford: a worker
 * polling a queue every few seconds would keep the serverless database awake
 * permanently and exhaust its monthly compute budget in about a fortnight.
 *
 * Instead, GitHub Actions calls this once an hour (.github/workflows/
 * cron-tick.yml), and every job it runs is idempotent — a missed tick, a
 * duplicated tick, or two ticks overlapping all produce the same end state.
 *
 * Two protections:
 *   - a shared secret in a header, compared in constant time;
 *   - an advisory lock, so an overlapping call returns immediately rather than
 *     doing the work twice.
 */
export function createCronRouter() {
  const router = Router();

  router.use((req, _res, next) => {
    const presented = req.headers['x-cron-secret'];
    if (!safeEqual(String(presented ?? ''), env.CRON_SECRET)) {
      log.warn({ ip: req.ip }, 'Rejected cron request with bad secret');
      return next(forbidden('Not permitted.'));
    }
    next();
  });

  router.post('/tick', async (req, res) => {
    const outcome = await withAdvisoryLock(LOCKS.CRON_TICK, async () => {
      const started = Date.now();
      const results = {};

      // Each job is isolated: one failure must not stop the others, because
      // the next attempt is an hour away.
      for (const [name, job] of Object.entries({
        expireUnpaidApprovals,
        flagOverdueReturns,
        processPendingRefunds,
        // Emails last, so this run delivers anything the jobs above queued.
        flushOutbox: () => flushOutbox({ limit: 50 }),
        pruneExpiredAuthRows,
      })) {
        try {
          results[name] = await job();
        } catch (err) {
          log.error({ err, job: name }, 'Cron job failed');
          results[name] = { error: String(err?.message ?? err) };
        }
      }

      const ms = Date.now() - started;
      log.info({ ms, results }, 'Cron tick complete');
      return { ms, results };
    });

    if (!outcome.ran) {
      return res.status(202).json({ data: { skipped: true, reason: 'Another tick is running' } });
    }
    res.json({ data: outcome.result });
  });

  /** Run one job by name — useful when debugging in production. */
  router.post('/jobs/:name', async (req, res) => {
    const jobs = {
      'expire-approvals': expireUnpaidApprovals,
      'flag-overdue': flagOverdueReturns,
      'process-refunds': processPendingRefunds,
      'flush-outbox': () => flushOutbox({ limit: 50 }),
      'prune-auth': pruneExpiredAuthRows,
    };
    const job = jobs[req.params.name];
    if (!job) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Unknown job. Try: ${Object.keys(jobs).join(', ')}` },
      });
    }
    res.json({ data: await job() });
  });

  return router;
}
