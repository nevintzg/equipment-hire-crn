import argon2 from 'argon2';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('password');

/**
 * Argon2id at the OWASP-recommended settings (19 MiB, 2 iterations, 1 lane).
 * Argon2id rather than bcrypt because it resists both GPU and side-channel
 * attacks, and because bcrypt silently truncates passwords at 72 bytes.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * A hash of a value nobody knows, used to burn the same CPU time when an
 * email does not exist as when it does. Without it, "user not found" returns
 * in 1ms and "wrong password" in 50ms, which is a usable account-enumeration
 * oracle — and account lists are exactly what a scraper wants.
 */
let dummyHash = null;

export async function hashPassword(plain) {
  return argon2.hash(plain, OPTIONS);
}

/**
 * @param {string | null | undefined} hash
 * @param {string} plain
 */
export async function verifyPassword(hash, plain) {
  if (!hash) {
    // No password set (invited staff member who never completed signup).
    // Still spend the time.
    dummyHash ??= await argon2.hash(randomFiller(), OPTIONS);
    await argon2.verify(dummyHash, plain).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch (err) {
    // A malformed hash in the database is an operational problem, not a
    // failed login — log it, but still answer "no".
    log.error({ err }, 'Password verification threw');
    return false;
  }
}

/** True when the stored hash was made with weaker settings and should be
 *  transparently upgraded on next successful login. */
export function needsRehash(hash) {
  try {
    return argon2.needsRehash(hash, OPTIONS);
  } catch {
    return false;
  }
}

const randomFiller = () => `${Date.now()}-${Math.random()}-filler`;
