import { argv } from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * True when this module was run directly (`node src/db/seed.js`) rather than
 * imported. ESM has no `require.main === module`, and comparing raw paths
 * breaks on symlinks — which is exactly what pnpm's node_modules is made of.
 *
 * @param {string} moduleUrl - pass import.meta.url
 */
export function isMain(moduleUrl) {
  if (!argv[1]) return false;
  try {
    return fileURLToPath(moduleUrl) === realpathSync(argv[1]);
  } catch {
    return moduleUrl === pathToFileURL(argv[1]).href;
  }
}
