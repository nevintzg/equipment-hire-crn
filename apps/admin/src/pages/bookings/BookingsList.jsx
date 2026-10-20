import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ErrorBox, Pagination, Spinner, StatusBadge, useTitle } from '@equipment-hire/client/ui';
import { dateRange, fullName, money, relative } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useOrg } from '../../lib/org.jsx';
import PageHeader from '../../components/PageHeader.jsx';

const TABS = [
  ['', 'All'],
  ['PENDING_REVIEW', 'To review'],
  ['APPROVED', 'Awaiting payment'],
  ['CONFIRMED', 'Confirmed'],
  ['PICKED_UP', 'On hire'],
  ['OVERDUE', 'Overdue'],
  ['RETURNED', 'To inspect'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];

export default function BookingsList() {
  useTitle('Bookings', 'Admin');
  const org = useOrg();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const search = params.get('search') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? '-createdAt';
  const page = Number(params.get('page') ?? 1);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const q = useQuery({
    queryKey: ['bookings', { status, search, from, to, sort, page }],
    queryFn: () =>
      api.list('/admin/bookings', { status, search, from, to, sort, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Bookings" />
      <div className="card card-flush">
        <div className="tabs" style={{ padding: '0 0.5rem', marginBottom: 0 }}>
          {TABS.map(([v, l]) => (
            <button
              key={v}
              className={status === v ? 'active' : ''}
              onClick={() => update({ status: v })}
            >
              {l}
            </button>
          ))}
        </div>
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: String(new FormData(e.currentTarget).get('search') ?? '').trim() });
          }}
        >
          <input
            key={search}
            name="search"
            className="input grow"
            type="search"
            defaultValue={search}
            placeholder="Reference, name, email or organisation"
            aria-label="Search bookings"
          />
          <label className="subtle">Starting</label>
          <input
            className="input"
            type="date"
            value={from}
            onChange={(e) => update({ from: e.target.value })}
            aria-label="Start from"
          />
          <span className="subtle">to</span>
          <input
            className="input"
            type="date"
            value={to}
            onChange={(e) => update({ to: e.target.value })}
            aria-label="Start to"
          />
          <select
            className="input"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            aria-label="Sort"
          >
            <option value="-createdAt">Newest first</option>
            <option value="createdAt">Oldest first</option>
            <option value="startAt">Soonest start</option>
            <option value="-startAt">Latest start</option>
            <option value="-totalDueCents">Highest value</option>
          </select>
        </form>
        {q.isPending ? (
          <Spinner />
        ) : q.isError ? (
          <div style={{ padding: '1rem' }}>
            <ErrorBox error={q.error} onRetry={q.refetch} />
          </div>
        ) : q.data.data.length === 0 ? (
          <div className="empty">No bookings match.</div>
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Hire dates</th>
                    <th>Status</th>
                    <th className="right">Total</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.data.map((b) => (
                    <tr
                      key={b.id}
                      className="clickable"
                      onClick={() => navigate(`/bookings/${b.id}`)}
                    >
                      <td className="mono nowrap">{b.reference}</td>
                      <td>
                        <strong>{fullName(b.customer)}</strong>
                        <div className="subtle">{b.customer.hirerOrgName || b.customer.email}</div>
                      </td>
                      <td className="nowrap">{dateRange(b.startAt, b.endAt, org.tz)}</td>
                      <td>
                        <StatusBadge status={b.status} />
                        {b.autoApproved && <div className="subtle">auto-approved</div>}
                      </td>
                      <td className="right nowrap">{money(b.totalDueCents, org.currency)}</td>
                      <td className="subtle nowrap">{relative(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={q.data.meta} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}
