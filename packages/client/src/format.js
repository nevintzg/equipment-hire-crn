/**
 * Display helpers. Money is integer cents everywhere; these are the only
 * places it becomes a string.
 */

const LOCALE = "en-AU";

/** @param {number|null|undefined} cents */
export function money(cents, currency = "AUD") {
  if (cents == null) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Dollars typed in a form → integer cents. Returns null for blank input. */
export function toCents(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Cents → a dollars string for a form input. */
export const toDollars = (cents) =>
  cents == null ? "" : (cents / 100).toFixed(2);

const fmt = (opts, tz) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...opts });

export function date(value, tz) {
  if (!value) return "—";
  return fmt(
    { weekday: "short", day: "numeric", month: "short", year: "numeric" },
    tz,
  ).format(new Date(value));
}

export function dateTime(value, tz) {
  if (!value) return "—";
  return fmt(
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
    tz,
  ).format(new Date(value));
}

export function shortDate(value, tz) {
  if (!value) return "—";
  return fmt({ day: "numeric", month: "short" }, tz).format(new Date(value));
}

export function time(value, tz) {
  if (!value) return "";
  return fmt({ hour: "numeric", minute: "2-digit" }, tz).format(
    new Date(value),
  );
}

/** "2 Mar – 4 Mar 2026" */
export function dateRange(start, end, tz) {
  if (!start) return "—";
  return `${shortDate(start, tz)} – ${date(end, tz)}`;
}

/** Today's date (YYYY-MM-DD) in a timezone. */
export function isoToday(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Add days to a YYYY-MM-DD string, calendar-wise (no DST surprises). */
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function relative(value) {
  if (!value) return "";
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export const plural = (n, one, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const PERIOD_LABELS = {
  PER_DAY: "per day",
  PER_HOUR: "per hour",
  PER_BOOKING: "per booking",
  WEEKEND: "per weekend",
  PER_WEEK: "per week",
};

export const fullName = (u) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : "";
