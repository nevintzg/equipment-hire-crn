import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox, Spinner, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';

/**
 * Starts Stripe Checkout and sends the browser there. Linked from the
 * approval email and from the booking page.
 */
export default function Pay() {
  const { reference } = useParams();
  useTitle('Payment');
  const started = useRef(false);
  const checkout = useMutation({
    mutationFn: () => api.post(`/bookings/${reference}/checkout`),
    onSuccess: (res) => window.location.assign(res.url),
  });

  useEffect(() => {
    // StrictMode mounts twice in development; one checkout session is enough.
    if (started.current) return;
    started.current = true;
    checkout.mutate();
  }, [checkout]);

  return (
    <div className="container container-narrow">
      <div className="card stack" style={{ textAlign: 'center' }}>
        <h1>Taking you to payment…</h1>
        {checkout.isError ? (
          <>
            <ErrorBox error={checkout.error} onRetry={() => checkout.mutate()} />
            <Link to={`/account/bookings/${reference}`}>Back to your booking</Link>
          </>
        ) : (
          <Spinner label="Opening secure payment" />
        )}
      </div>
    </div>
  );
}
