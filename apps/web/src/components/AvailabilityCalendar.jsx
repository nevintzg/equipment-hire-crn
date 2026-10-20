import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, isoToday } from '@equipment-hire/client';
import { api } from '../lib/api.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
const daysInMonth = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
/** 0 = Monday. */
const weekday = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Month view of free stock. Clicking a day starts a range, clicking another
 * ends it; the selection is lifted to the parent so it can seed the basket.
 */
export default function AvailabilityCalendar({ slug, tz, start, end, onSelect, quantity = 1 }) {
  const today = isoToday(tz);
  const [month, setMonth] = useState(() => monthStart(start || today));
  const from = month;
  const to = addDays(month, daysInMonth(month) - 1);

  const { data, isPending, isError } = useQuery({
    queryKey: ['equipment', slug, 'availability', from],
    queryFn: () => api.get(`/equipment/${slug}/availability`, { from, to }),
    staleTime: 15_000,
  });

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const lead = weekday(from);
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth(month) }, (_, i) => addDays(from, i)),
  ];

  const pick = (iso) => {
    if (!onSelect) return;
    if (!start || (start && end) || iso < start) onSelect({ start: iso, end: '' });
    else onSelect({ start, end: iso });
  };

  const label = new Intl.DateTimeFormat('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00Z`));

  return (
    <div>
      <div className="cal-head">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setMonth(addMonths(month, -1))}
          disabled={month <= monthStart(today)}
          aria-label="Previous month"
        >
          ←
        </button>
        <strong>{label}</strong>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <div className="cal" aria-busy={isPending}>
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} className="cal-day empty" />;
          const day = byDate.get(iso);
          const past = iso < today;
          const short = day && day.available < quantity;
          const cls = [
            'cal-day',
            past
              ? 'past'
              : !day
                ? 'empty'
                : short || day.status === 'FULL'
                  ? 'full'
                  : day.status === 'PARTIAL'
                    ? 'partial'
                    : '',
            start && end && iso >= start && iso <= end ? 'in-range' : '',
            iso === start || iso === end ? 'edge' : '',
          ].join(' ');
          return (
            <button
              key={iso}
              className={cls}
              disabled={past || !day || short}
              onClick={() => pick(iso)}
              title={day ? `${day.available} of ${day.capacity} available` : undefined}
              aria-label={`${iso}${day ? `, ${day.available} available` : ''}`}
            >
              {Number(iso.slice(8))}
              {day && !past && day.capacity > 1 && <small>{day.available}</small>}
            </button>
          );
        })}
      </div>
      {isError && <p className="subtle">Availability could not be loaded.</p>}
      <div className="cal-legend">
        <span style={{ '--swatch': 'var(--success-bg)' }}>Available</span>
        <span style={{ '--swatch': 'var(--warning-bg)' }}>Limited</span>
        <span style={{ '--swatch': 'var(--danger-bg)' }}>Booked out</span>
      </div>
    </div>
  );
}
