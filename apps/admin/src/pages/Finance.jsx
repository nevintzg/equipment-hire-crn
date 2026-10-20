import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorBox, Spinner, useTitle } from '@equipment-hire/client/ui';
import { dateTime, money, relative } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useOrg } from '../lib/org.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Finance() {
  useTitle('Bonds & finance', 'Admin');
  const org = useOrg();
  const navigate = useNavigate();
  const bonds = useQuery({
    queryKey: ['bonds-awaiting'],
    queryFn: () => api.get('/admin/payments/bonds-awaiting-release'),
  });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/admin/dashboard') });

  return (
    <>
      <PageHeader title="Bonds & finance" />
      {dash.data && (
        <div className="stats">
          <div className="stat">
            <div className="value">{money(dash.data.revenueThisMonthCents, org.currency)}</div>
            <div className="label">Hire income this month (excl. bonds)</div>
          </div>
          <div className="stat">
            <div className="value">{dash.data.counts.awaitingPayment}</div>
            <div className="label">Approved, awaiting payment</div>
          </div>
          <div className="stat">
            <div className="value">{bonds.data?.length ?? '—'}</div>
            <div className="label">Bonds awaiting inspection</div>
          </div>
        </div>
      )}
      <div className="card card-flush">
        <div style={{ padding: '1rem 1rem 0.5rem' }}>
          <h3 style={{ margin: 0 }}>Returned, bond not yet settled</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Complete the inspection on each booking to release the bond.
          </p>
        </div>
        {bonds.isPending ? (
          <Spinner />
        ) : bonds.error ? (
          <div style={{ padding: '1rem' }}>
            <ErrorBox error={bonds.error} />
          </div>
        ) : bonds.data.length === 0 ? (
          <div className="empty">All bonds are settled.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Returned</th>
                <th className="right">Bond held</th>
              </tr>
            </thead>
            <tbody>
              {bonds.data.map((b) => (
                <tr
                  key={b.bookingId}
                  className="clickable"
                  onClick={() => navigate(`/bookings/${b.bookingId}`)}
                >
                  <td className="mono">{b.reference}</td>
                  <td>
                    {dateTime(b.returnedAt, org.tz)}{' '}
                    <span className="subtle">({relative(b.returnedAt)})</span>
                  </td>
                  <td className="right">{money(b.bondTotalCents, org.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
