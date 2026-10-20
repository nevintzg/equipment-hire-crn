import { DateTime } from 'luxon';

/**
 * Presentation helpers, used for emails and PDFs. The frontend formats its own
 * output; these exist because server-rendered email has to look right too.
 */

/** 123456 → "$1,234.56". Money is cents everywhere internally. */
export function formatMoney(cents, currency = 'AUD', locale = 'en-AU') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format((cents ?? 0) / 100);
}

/** "Saturday 14 March 2026, 9:00 am" in the organisation's timezone. */
export function formatDateTime(date, timezone, locale = 'en-AU') {
  if (!date) return '';
  return DateTime.fromJSDate(new Date(date), { zone: timezone })
    .setLocale(locale)
    .toFormat('cccc d LLLL yyyy, h:mm a');
}

export function formatDate(date, timezone, locale = 'en-AU') {
  if (!date) return '';
  return DateTime.fromJSDate(new Date(date), { zone: timezone })
    .setLocale(locale)
    .toFormat('d LLLL yyyy');
}

/** "3 days" / "1 day" — avoids "1 days" in customer-facing copy. */
export const pluralise = (n, singular, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

/** Slug from a name, for categories and equipment created in the admin UI. */
export const slugify = (input) =>
  String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
