import { afterAll } from 'vitest';
import { closeDatabase } from '#src/db/client.js';

// Without this the pool keeps the event loop alive and vitest hangs on exit.
afterAll(async () => {
  await closeDatabase();
});
