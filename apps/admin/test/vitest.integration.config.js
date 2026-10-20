import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

/**
 * Test-only Vitest config for the admin panel's integration tests.
 *
 * Unlike the unit tests, these tests click buttons and wait for the page to
 * change, so they run in jsdom: a browser-like page (document, window,
 * localStorage) simulated inside Node.js.
 *
 * The React plugin is the same one vite.config.js uses, so the components'
 * JSX is compiled exactly as it is for the real admin panel.
 */
export default {
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['test/integration/**/*.test.js'],
    setupFiles: ['test/integration/setup.js'],
  },
};
