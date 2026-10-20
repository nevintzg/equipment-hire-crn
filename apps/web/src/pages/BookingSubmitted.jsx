import { Link, useParams } from 'react-router-dom';
import { useTitle } from '@equipment-hire/client/ui';
import { useSite } from '../lib/site.jsx';

export default function BookingSubmitted() {
  const { reference } = useParams();
  const site = useSite();
  useTitle('Request received', site.name);
  return (
    <div className="container container-narrow">
      <div className="card stack" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <h1>Thanks — we&rsquo;ve got your request</h1>
        <p className="muted">
          Your reference is <strong className="mono">{reference}</strong>. Our team will review it
          and email you. Once it&rsquo;s approved you&rsquo;ll be able to pay online to confirm it.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" to={`/account/bookings/${reference}`}>
            View booking
          </Link>
          <Link className="btn" to="/equipment">
            Keep browsing
          </Link>
        </div>
      </div>
    </div>
  );
}
