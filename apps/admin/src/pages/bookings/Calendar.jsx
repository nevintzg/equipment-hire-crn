import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorBox, useTitle } from '@equipment-hire/client/ui';
import { addDays, isoToday, statusLabel, statusTone } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useOrg } from '../../lib/org.jsx';
import PageHeader from '../../components/PageHeader.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekday = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}
const localIso = (value, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(value));

/** Month grid of every booking holding stock. */
export default function Calendar() {
  useTitle('Calendar', 'Admin');
  const org = useOrg();
  const today = isoToday(org.tz);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);

  // Six full weeks starting on the Monday on or before the 1st.
  const gridStart = addDays(month, -weekday(month));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const gridEnd = days[41];

  const q = useQuery({
    queryKey: ['calendar', gridStart],
    queryFn: () => api.get('/admin/calendar', { from: gridStart, to: gridEnd }),
  });

  const byDay = new Map(days.map((d) => [d, []]));
  for (const b of q.data ?? []) {
    const s = localIso(b.startAt, org.tz);
    const e = localIso(b.endAt, org.tz);
    for (const d of days)
      if (d >= s && d <= e) byDay.get(d).push({ ...b, isStart: d === s, isEnd: d === e });
  }

  const label = new Intl.DateTimeFormat('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00Z`));

  return (
    <>
      <PageHeader title="Calendar" subtitle="Bookings that are holding equipment">
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
          ←
        </button>
        <strong style={{ minWidth: 140, textAlign: 'center' }}>{label}</strong>
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>
          →
        </button>
        <button className="btn btn-sm" onClick={() => setMonth(`${today.slice(0, 7)}-01`)}>
          Today
        </button>
      </PageHeader>
      <ErrorBox error={q.error} />
      <div className="month" style={{ opacity: q.isFetching ? 0.6 : 1 }}>
        {DOW.map((d) => (
          <div key={d} className="month-dow">
            {d}
          </div>
        ))}
        {days.map((d) => (
          <div
            key={d}
            className={`month-cell ${d.slice(0, 7) !== month.slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''}`}
          >
            <span className="day-num">{Number(d.slice(8))}</span>
            {byDay.get(d).map((b) => (
              <Link
                key={b.id}
                to={`/bookings/${b.id}`}
                className={`chip chip-${statusTone(b.status)}`}
                title={`${b.reference} · ${b.customerName} · ${statusLabel(b.status)}`}
              >
                {b.isStart ? '▸ ' : ''}
                {b.customerName}
                {b.isEnd ? ' ◂' : ''}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <p className="subtle" style={{ marginTop: 8 }}>
        ▸ collection day · ◂ return day
      </p>
    </>
  );
}
