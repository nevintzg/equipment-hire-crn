import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads this to generate SQL migrations from src/db/schema.
 * Migrations are applied by src/db/migrate.js (not by drizzle-kit push) so
 * that production deploys run them under an advisory lock.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.js',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
