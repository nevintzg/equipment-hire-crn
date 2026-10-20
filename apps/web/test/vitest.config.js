import { fileURLToPath } from 'node:url';

/**
 * Test-only Vitest config for the customer site's unit tests.
 *
 * Vitest is installed in apps/api, not in apps/web, so this file exports a
 * plain object (no import from 'vitest/config') and is run with the API's
 * Vitest binary. `root` points at apps/web so the tests resolve React and the
 * app's own source files.
 */
export default {
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    globals: false,
    include: ['test/unit/**/*.test.js'],
    // No media bucket in tests, so equipment without a full image URL always
    // shows the generated placeholder. Keeps results the same on every machine.
    env: { VITE_MEDIA_URL: '' },
  },
};
