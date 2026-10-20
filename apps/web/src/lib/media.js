/**
 * Equipment images are stored as object keys. VITE_MEDIA_URL is the public
 * bucket URL (the API's S3_PUBLIC_BASE_URL); without it, images fall back to
 * a generated placeholder.
 */
const base = (import.meta.env.VITE_MEDIA_URL ?? '').replace(/\/$/, '');

export function mediaUrl(key) {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return base ? `${base}/${key}` : null;
}
