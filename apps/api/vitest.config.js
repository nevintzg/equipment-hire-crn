import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Load .env.test explicitly.
 *
 * Vitest does not read .env files the way the app's `node --env-file` does, so
 * without this the suite would inherit whatever is in the shell — including,
 * on a developer's machine, the development DATABASE_URL. test/global-setup.js
 * refuses to run unless the database name contains "test", and this is what
 * makes that check pass for the right reason.
 */
function loadTestEnv() {
  try {
    return Object.fromEntries(
      readFileSync(new URL('./.env.test', import.meta.url), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=');
          return [
            line.slice(0, i).trim(),
            line
              .slice(i + 1)
              .trim()
              .replace(/^["']|["']$/g, ''),
          ];
        }),
    );
  } catch {
    return {};
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.js'],
    env: loadTestEnv(),
    // Integration tests share one database: run files sequentially so that
    // truncation in one file cannot pull the rug from under another.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup.js'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/db/schema/**', 'src/db/seed.js'],
    },
  },
});
