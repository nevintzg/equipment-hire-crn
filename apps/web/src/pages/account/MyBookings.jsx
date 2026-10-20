import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ErrorBox, Pagination, Spinner, StatusBadge, useTitle } from '@equipment-hire/client/ui';
import { dateRange, money } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useSite } from '../../lib/site.jsx';

const FILTERS = [
  ['', 'All'],
  ['ACTIVE', 'Current'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];

export default function MyBookings() {
  const site = useSite();
  useTitle('My bookings', site.name);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['my-bookings', status, page],
    queryFn: () => api.list('/bookings', { status, page, pageSize: 10 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="card card-flush">
      <div className="spread" style={{ padding: '1rem 1.25rem 0' }}>
        <h2 style={{ margin: 0 }}>My bookings</h2>
        <Link to="/equipment" className="btn btn-sm btn-primary">
          New booking
        </Link>
      </div>
      <div className="tabs" style={{ padding: '0 1.25rem', marginBottom: 0 }}>
        {FILTERS.map(([v, l]) => (
          <button
            key={v}
            className={status === v ? 'active' : ''}
            onClick={() => {
              setStatus(v);
              setPage(1);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <div style={{ padding: '1rem' }}>
          <ErrorBox error={q.error} onRetry={q.refetch} />
        </div>
      ) : q.data.data.length === 0 ? (
        <div className="empty">No bookings here yet.</div>
      ) : (
        <>
          {q.data.data.map((b) => (
            <Link key={b.id} to={`/account/bookings/${b.reference}`} className="booking-row">
              <div>
                <div className="row" style={{ '--gap': '0.5rem' }}>
                  <strong className="mono">{b.reference}</strong>
                  <StatusBadge status={b.status} />
                </div>
                <div className="subtle">{dateRange(b.startAt, b.endAt, site.tz)}</div>
              </div>
              <div className="right">
                <strong>{money(b.totalDueCents, site.currency)}</strong>
                {b.status === 'APPROVED' && <div className="subtle">Payment needed</div>}
              </div>
            </Link>
          ))}
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
