import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Opaque secrets and the human-facing references built from them.
 */

/** URL-safe random token. 32 bytes is comfortably beyond brute force. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/**
 * Hash for at-rest storage of a token.
 *
 * Plain SHA-256 rather than argon2 on purpose: these tokens are already 256
 * bits of entropy, so there is nothing to brute-force, and verification
 * happens on every refresh — a deliberately slow hash would just add latency.
 * Passwords are different and use argon2 (lib/password.js).
 */
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** Constant-time comparison for secrets sent in headers (the cron secret). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare hashes so differing lengths do not leak via an early return.
  return timingSafeEqual(
    createHash('sha256').update(ab).digest(),
    createHash('sha256').update(bb).digest(),
  );
}

// Crockford-style alphabet: no I, O, L, U, so a reference read over the phone
// to a volunteer cannot be mistyped as a different valid one.
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Booking reference, e.g. BK-7KQ4M2. Short enough to quote, with ~1e9
 * possibilities; the unique index on (organisation_id, reference) is the
 * actual guarantee and the caller retries on collision.
 */
export function bookingReference(prefix = 'BK') {
  let out = '';
  for (let i = 0; i < 6; i += 1) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `${prefix}-${out}`;
}

/** Numeric code for emails that ask the user to type something short. */
export const numericCode = (digits = 6) => String(randomInt(0, 10 ** digits)).padStart(digits, '0');
