import { mediaUrl } from '../lib/media.js';

const initials = (name = '') =>
  name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/** An equipment photo, or a branded placeholder when there is none. */
export default function EquipmentVisual({ storageKey, name, alt, className = '' }) {
  const src = mediaUrl(storageKey);
  if (src)
    return <img src={src} alt={alt ?? name} className={`eq-visual ${className}`} loading="lazy" />;
  return (
    <div className={`eq-placeholder ${className}`} role="img" aria-label={name}>
      {initials(name)}
    </div>
  );
}
