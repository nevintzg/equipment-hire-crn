import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import { env, isProduction } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';

/**
 * Database pool and Drizzle instance.
 *
 * Pool sizing is deliberately small. The managed free-tier database scales to
 * zero after five minutes idle and allows far fewer connections than a
 * self-hosted instance, so the API holds a handful and recycles them quickly
 * rather than keeping a large pool warm.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // Release connections quickly: a sleeping database drops them anyway, and a
  // stale socket surfaces as a confusing error on the next query.
  idleTimeoutMillis: 10_000,
  // Generous, because a cold start has to wake the database first.
  connectionTimeoutMillis: 15_000,
  // Managed Postgres terminates idle sessions; keepalive makes the client
  // notice promptly instead of handing out a dead connection.
  keepAlive: true,
  ssl: isProduction ? { rejectUnauthorized: true } : undefined,
  application_name: 'eqhire-api',
});

// An error on an *idle* client is not tied to any query, so it has no caller
// to reject. Without this listener Node treats it as unhandled and exits.
pool.on('error', (err) => {
  logger.error({ err }, 'Idle database client errored');
});

export const db = drizzle(pool, {
  schema,
  casing: 'snake_case',
  logger: env.LOG_LEVEL === 'trace',
});

/** @typedef {typeof db} Database */
/** @typedef {Parameters<Parameters<typeof db.transaction>[0]>[0]} Tx */

/**
 * Advisory lock keys.
 *
 * Postgres advisory locks are process-wide mutexes held by a connection. They
 * are how this codebase stops two instances — or two cron ticks that overlap
 * because one ran long — doing the same job twice, without a Redis lock.
 */
export const LOCKS = {
  MIGRATE: 100_001,
  CRON_TICK: 100_002,
  OUTBOX_FLUSH: 100_003,
};

/**
 * Run `fn` while holding an advisory lock, or skip it if someone else holds it.
 *
 * Uses pg_try_advisory_lock (non-blocking): for scheduled work, skipping this
 * tick is the right answer — the next one is an hour away and every operation
 * is idempotent. Blocking would just pile up connections.
 *
 * @template T
 * @param {number} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ ran: boolean, result?: T }>}
 */
export async function withAdvisoryLock(key, fn) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    if (!rows[0].locked) {
      logger.info({ key }, 'Advisory lock held elsewhere, skipping');
      return { ran: false };
    }
    try {
      return { ran: true, result: await fn() };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    client.release();
  }
}

/** Cheap liveness probe for /ready. */
export async function pingDatabase() {
  await db.execute(sql`SELECT 1`);
}

/** Close the pool on shutdown. Safe to call twice. */
let closed = false;
export async function closeDatabase() {
  if (closed) return;
  closed = true;
  await pool.end().catch((err) => logger.warn({ err }, 'Error closing database pool'));
}
