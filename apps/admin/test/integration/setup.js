import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Runs after every integration test so that each test starts fresh and one
 * test can never change the result of another.
 */
afterEach(() => {
  cleanup(); // remove the page the test rendered
  vi.clearAllMocks(); // forget which fake API calls the test made
});
