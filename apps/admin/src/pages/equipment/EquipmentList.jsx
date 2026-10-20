import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, ErrorBox, Pagination, Spinner, useTitle } from '@equipment-hire/client/ui';
import { money, relative, titleCase } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useOrg } from '../../lib/org.jsx';
import { useAuth } from '../../lib/auth.jsx';
import PageHeader from '../../components/PageHeader.jsx';

const TONE = { PUBLISHED: 'success', DRAFT: 'warning', ARCHIVED: 'neutral' };

export default function EquipmentList() {
  useTitle('Equipment', 'Admin');
  const org = useOrg();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  const q = useQuery({
    queryKey: ['admin-equipment', { search, status, page }],
    queryFn: () => api.list('/admin/equipment', { search, status, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const catName = (id) => org.categories.find((c) => c.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader title="Equipment">
        {can('equipment.create') && (
          <Link to="/equipment/new" className="btn btn-primary">
            Add equipment
          </Link>
        )}
      </PageHeader>
      <div className="card card-flush">
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
            placeholder="Name or SKU"
            aria-label="Search equipment"
          />
          <select
            className="input"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
            aria-label="Status"
          >
            <option value="">Any status</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </form>
        {q.isPending ? (
          <Spinner />
        ) : q.isError ? (
          <div style={{ padding: '1rem' }}>
            <ErrorBox error={q.error} />
          </div>
        ) : q.data.data.length === 0 ? (
          <div className="empty">No equipment yet.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th className="right">Bond</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.data.map((e) => (
                    <tr
                      key={e.id}
                      className="clickable"
                      onClick={() => navigate(`/equipment/${e.id}`)}
                    >
                      <td>
                        <strong>{e.name}</strong>
                        {e.sku && <div className="subtle mono">{e.sku}</div>}
                      </td>
                      <td>{catName(e.categoryId)}</td>
                      <td>
                        {e.inventoryMode === 'BULK'
                          ? `${e.bulkQuantity} (pool)`
                          : `${e.unitCount} unit${e.unitCount === 1 ? '' : 's'}`}
                      </td>
                      <td className="right">{money(e.bondCents, org.currency)}</td>
                      <td>
                        <Badge tone={TONE[e.status]}>{titleCase(e.status)}</Badge>
                      </td>
                      <td className="subtle nowrap">{relative(e.updatedAt)}</td>
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
