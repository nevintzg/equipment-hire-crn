import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, ErrorBox, Pagination, Spinner, useTitle } from '@equipment-hire/client/ui';
import { fullName, relative } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';

export default function Customers() {
  useTitle('Customers', 'Admin');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const filter = params.get('filter') ?? '';
  const page = Number(params.get('page') ?? 1);
  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  const q = useQuery({
    queryKey: ['customers', { search, filter, page }],
    queryFn: () => api.list('/admin/customers', { search, filter, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Customers" />
      <div className="card card-flush">
        <div className="tabs" style={{ padding: '0 0.5rem', marginBottom: 0 }}>
          {[
            ['', 'All'],
            ['UNCONFIRMED_TYPE', 'Type to confirm'],
            ['BLOCKED', 'Blocked'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={filter === v ? 'active' : ''}
              onClick={() => update({ filter: v })}
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
            placeholder="Name, email or organisation"
            aria-label="Search customers"
          />
        </form>
        {q.isPending ? (
          <Spinner />
        ) : q.isError ? (
          <div style={{ padding: '1rem' }}>
            <ErrorBox error={q.error} />
          </div>
        ) : q.data.data.length === 0 ? (
          <div className="empty">No customers match.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Organisation</th>
                    <th>Type</th>
                    <th>Bookings</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.data.map((c) => (
                    <tr
                      key={c.id}
                      className="clickable"
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <td>
                        <strong>{fullName(c)}</strong>
                        <div className="subtle">{c.email}</div>
                      </td>
                      <td>{c.hirerOrgName ?? '—'}</td>
                      <td>
                        {c.customerTypeName ? (
                          <Badge tone={c.customerTypeConfirmedAt ? 'success' : 'warning'}>
                            {c.customerTypeName}
                            {c.customerTypeConfirmedAt ? '' : ' · unconfirmed'}
                          </Badge>
                        ) : (
                          '—'
                        )}
                        {c.blockedAt && (
                          <>
                            {' '}
                            <Badge tone="danger">Blocked</Badge>
                          </>
                        )}
                      </td>
                      <td>{c.bookingCount}</td>
                      <td className="subtle nowrap">{relative(c.createdAt)}</td>
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
