import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorBox, Spinner, StatusBadge, useTitle } from '@equipment-hire/client/ui';
import { date, money, relative, time } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useOrg } from '../lib/org.jsx';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

function DayList({ title, rows, field, empty, tz }) {
  const navigate = useNavigate();
  return (
    <div className="card card-flush">
      <div style={{ padding: '1rem 1rem 0.5rem' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="empty" style={{ padding: '1.25rem' }}>
          {empty}
        </div>
      ) : (
        <table className="table">
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="clickable" onClick={() => navigate(`/bookings/${b.id}`)}>
                <td className="nowrap">{time(b[field], tz)}</td>
                <td>
                  <strong>{b.customerName}</strong>
                  {b.hirerOrgName && <div className="subtle">{b.hirerOrgName}</div>}
                </td>
                <td className="mono">{b.reference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Dashboard() {
  useTitle('Dashboard', 'Admin');
  const org = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
  });

  if (isPending) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  const c = data.counts;

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.firstName}`}
        subtitle={date(new Date(), org.tz)}
      />
      <div className="stats">
        <Link
          to="/bookings?status=PENDING_REVIEW"
          className={`stat ${c.pendingReview ? 'warn' : ''}`}
        >
          <div className="value">{c.pendingReview}</div>
          <div className="label">Awaiting review</div>
        </Link>
        <Link to="/bookings?status=APPROVED" className="stat">
          <div className="value">{c.awaitingPayment}</div>
          <div className="label">Awaiting payment</div>
        </Link>
        <Link to="/bookings?status=PICKED_UP" className="stat">
          <div className="value">{c.onHire}</div>
          <div className="label">On hire now</div>
        </Link>
        <Link to="/bookings?status=OVERDUE" className={`stat ${c.overdue ? 'danger' : ''}`}>
          <div className="value">{c.overdue}</div>
          <div className="label">Overdue returns</div>
        </Link>
        <Link to="/enquiries" className="stat">
          <div className="value">{c.openEnquiries}</div>
          <div className="label">Open enquiries</div>
        </Link>
        <div className="stat">
          <div className="value">{money(data.revenueThisMonthCents, org.currency)}</div>
          <div className="label">Hire income this month</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        <DayList
          title="Collections today"
          rows={data.pickupsToday}
          field="startAt"
          empty="No collections today."
          tz={org.tz}
        />
        <DayList
          title="Returns due today"
          rows={data.returnsToday}
          field="endAt"
          empty="No returns due today."
          tz={org.tz}
        />
      </div>

      <div className="card card-flush">
        <div className="spread" style={{ padding: '1rem 1rem 0.5rem' }}>
          <h3 style={{ margin: 0 }}>Latest bookings</h3>
          <Link to="/bookings">All bookings →</Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Starts</th>
                <th>Status</th>
                <th className="right">Total</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => navigate(`/bookings/${b.id}`)}>
                  <td className="mono">{b.reference}</td>
                  <td>{b.customerName}</td>
                  <td className="nowrap">{date(b.startAt, org.tz)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="right">{money(b.totalDueCents, org.currency)}</td>
                  <td className="subtle nowrap">{relative(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
