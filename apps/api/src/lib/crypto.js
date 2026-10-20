import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '#src/config/env.js';

/**
 * AES-256-GCM for secrets that must be stored but also read back — currently
 * per-organisation Stripe keys.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: a
 * tampered ciphertext fails to decrypt instead of producing plausible garbage.
 * Format is iv:tag:ciphertext, all base64url, so the whole thing fits in one
 * text column and is self-describing.
 */
const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = randomBytes(12); // 96 bits, the size GCM is specified for
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ct.toString('base64url'),
  ].join(':');
}

export function decrypt(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, ctB64] = String(payload).split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
