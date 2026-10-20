import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';

/**
 * Stripe's success redirect. The webhook, not this page, confirms the
 * booking — so poll briefly until the status catches up.
 */
export default function Paid() {
  const { reference } = useParams();
  useTitle('Payment received');
  const { data } = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => api.get(`/bookings/${reference}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'CONFIRMED' || q.state.dataUpdateCount > 10 ? false : 2000,
  });
  const confirmed = data?.status === 'CONFIRMED';
  return (
    <div className="container container-narrow">
      <div className="card stack" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <h1>{confirmed ? 'Your booking is confirmed' : 'Thanks for your payment'}</h1>
        <p className="muted">
          {confirmed
            ? 'A confirmation is on its way to your inbox, with everything you need for collection.'
            : 'We are just confirming it with the bank — this usually takes a few seconds.'}
        </p>
        {data && (
          <div>
            <StatusBadge status={data.status} />
          </div>
        )}
        <div>
          <Link className="btn btn-primary" to={`/account/bookings/${reference}`}>
            View booking {reference}
          </Link>
        </div>
      </div>
    </div>
  );
}
