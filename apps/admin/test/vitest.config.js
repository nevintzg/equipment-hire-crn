import { fileURLToPath } from 'node:url';

/**
 * Test-only Vitest config for the admin panel's unit tests.
 *
 * Vitest is installed in apps/api, not in apps/admin, so this file exports a
 * plain object (no import from 'vitest/config') and is run with the API's
 * Vitest binary. `root` points at apps/admin so the tests resolve React and
 * the app's own source files.
 */
export default {
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    globals: false,
    include: ['test/unit/**/*.test.js'],
  },
};
