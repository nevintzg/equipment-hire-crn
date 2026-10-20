import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Runs once before the whole suite.
 *
 * Migrations are applied to the test database here rather than in each file,
 * so the schema is guaranteed present and the cost is paid once. The test
 * database is separate from the development one (created by
 * docker/postgres-init/01-test-database.sql) because these tests truncate
 * tables, and doing that to someone's dev data would be unforgivable.
 */
export default async function setup() {
  // The global setup file runs in Vitest's own process, where test.env has not
  // been applied yet, so .env.test is read directly.
  for (const line of readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    if (!process.env[key]) {
      process.env[key] = trimmed
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }

  process.env.NODE_ENV = 'test';

  // A loud guard, not a nicety: these tests TRUNCATE every table.
  if (!process.env.DATABASE_URL?.includes('test')) {
    throw new Error(
      `Refusing to run tests against "${process.env.DATABASE_URL}" — the database name must contain "test".`,
    );
  }

  execSync('node src/db/migrate.js', { stdio: 'inherit', env: process.env });
}
