/**
 * Handover windows. The API rejects a booking whose collection or return time
 * falls outside them, so the basket only offers times that will be accepted.
 * Weekday follows JavaScript: Sunday = 0.
 */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

const matches = (slot, kind) => slot.kind === 'BOTH' || slot.kind === kind;

/** Half-hourly times on a date that fall inside a slot of the given kind. */
export function timesFor(slots, iso, kind) {
  if (!slots?.length) return null; // no windows: any time is fine
  if (!iso) return [];
  const wd = weekdayOf(iso);
  const out = new Set();
  for (const s of slots.filter((x) => x.weekday === wd && matches(x, kind))) {
    for (let t = toMin(s.startTime); t <= toMin(s.endTime); t += 30) out.add(toHHMM(t));
  }
  return [...out].sort();
}

/** "Fri 4pm–6pm, Sat 9am–12pm" */
export function describeSlots(slots, kind) {
  return (slots ?? [])
    .filter((s) => matches(s, kind))
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
    .map((s) => `${DAY_NAMES[s.weekday]} ${timeLabel(s.startTime)}–${timeLabel(s.endTime)}`)
    .join(', ');
}
