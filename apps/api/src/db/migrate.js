import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { directDatabaseUrl, isProduction } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { isMain } from '#src/lib/is-main.js';

/**
 * Migration runner.
 *
 * Two things make this more than a one-liner:
 *
 * 1. It connects on the DIRECT url, not the pooled one. Transaction-mode
 *    connection poolers do not support the session-level statements that DDL
 *    and advisory locks need, so running migrations through the pooler fails
 *    in ways that look like syntax errors.
 *
 * 2. It takes an advisory lock first. The production start command is
 *    `migrate && serve`, so a deploy that starts two instances would otherwise
 *    run migrations twice concurrently — which usually ends with one instance
 *    crashing on a half-created type.
 */
export async function runMigrations() {
  const pool = new Pool({
    connectionString: directDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 30_000,
    ssl: isProduction ? { rejectUnauthorized: true } : undefined,
    application_name: 'eqhire-migrate',
  });

  const client = await pool.connect();
  try {
    // Blocking lock here, unlike the cron tick: if another instance is
    // migrating, this one must wait for the schema rather than boot against
    // a half-applied one.
    await client.query('SELECT pg_advisory_lock($1)', [100_001]);
    logger.info('Applying migrations…');
    const started = Date.now();
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    logger.info({ ms: Date.now() - started }, 'Migrations up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [100_001]).catch(() => {});
    client.release();
    await pool.end();
  }
}

if (isMain(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      console.error(err);
      process.exit(1);
    });
}
