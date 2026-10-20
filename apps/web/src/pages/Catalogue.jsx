import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ErrorBox, Field, Pagination, Spinner, useTitle } from '@equipment-hire/client/ui';
import { isoToday } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';
import EquipmentCard from '../components/EquipmentCard.jsx';

export default function Catalogue() {
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const search = params.get('search') ?? '';
  const availableFrom = params.get('from') ?? '';
  const availableTo = params.get('to') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page') ?? 1);

  const current = site.categories.find((c) => c.slug === category);
  useTitle(current?.name ?? 'Equipment', site.name);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const query = useQuery({
    queryKey: ['equipment', 'browse', { category, search, availableFrom, availableTo, sort, page }],
    queryFn: () =>
      api.list('/equipment', {
        category,
        search,
        availableFrom: availableFrom && availableTo ? availableFrom : undefined,
        availableTo: availableFrom && availableTo ? availableTo : undefined,
        sort: sort || undefined,
        page,
        pageSize: 18,
      }),
    placeholderData: keepPreviousData,
  });

  const today = isoToday(site.tz);
  const top = site.categories.filter((c) => !c.parentId);

  return (
    <div className="container catalogue">
      <aside className="filters stack">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: String(new FormData(e.currentTarget).get('search') ?? '').trim() });
          }}
        >
          <Field label="Search">
            {/* Keyed on the URL value so back/forward resets the box. */}
            <input
              key={search}
              name="search"
              className="input"
              type="search"
              defaultValue={search}
              placeholder="What do you need?"
            />
          </Field>
        </form>

        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Category
          </div>
          <nav className="cat-list">
            <Link
              to="/equipment"
              className={!category ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                update({ category: '' });
              }}
            >
              Everything
            </Link>
            {top.map((c) => (
              <div key={c.id}>
                <a
                  href={`/equipment?category=${c.slug}`}
                  className={category === c.slug ? 'active' : ''}
                  onClick={(e) => {
                    e.preventDefault();
                    update({ category: c.slug });
                  }}
                >
                  {c.name}
                </a>
                {site.categories
                  .filter((s) => s.parentId === c.id)
                  .map((s) => (
                    <a
                      key={s.id}
                      href={`/equipment?category=${s.slug}`}
                      style={{ paddingLeft: '1.4rem' }}
                      className={category === s.slug ? 'active' : ''}
                      onClick={(e) => {
                        e.preventDefault();
                        update({ category: s.slug });
                      }}
                    >
                      {s.name}
                    </a>
                  ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="stack" style={{ '--gap': '0.6rem' }}>
          <div className="label">Available between</div>
          <input
            className="input"
            type="date"
            min={today}
            value={availableFrom}
            aria-label="From date"
            onChange={(e) =>
              update({
                from: e.target.value,
                to: availableTo && availableTo >= e.target.value ? availableTo : e.target.value,
              })
            }
          />
          <input
            className="input"
            type="date"
            min={availableFrom || today}
            value={availableTo}
            aria-label="To date"
            onChange={(e) => update({ to: e.target.value })}
          />
          {(availableFrom || availableTo) && (
            <button className="btn btn-sm btn-ghost" onClick={() => update({ from: '', to: '' })}>
              Clear dates
            </button>
          )}
        </div>
      </aside>

      <section>
        <div className="spread" style={{ marginBottom: '1rem' }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>
              {current?.name ?? (search ? `Results for “${search}”` : 'All equipment')}
            </h1>
            {current?.description && (
              <p className="muted" style={{ margin: 0 }}>
                {current.description}
              </p>
            )}
          </div>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            aria-label="Sort"
          >
            <option value="">Recommended</option>
            <option value="name">Name A–Z</option>
            <option value="-name">Name Z–A</option>
            <option value="-createdAt">Newest</option>
          </select>
        </div>

        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorBox error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.data.length === 0 ? (
          <div className="card empty">
            <p>Nothing matches those filters.</p>
            <button className="btn" onClick={() => setParams(new URLSearchParams())}>
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <p className="subtle">
              {query.data.meta.total} item{query.data.meta.total === 1 ? '' : 's'}
              {availableFrom && availableTo ? ' available for your dates' : ''}
            </p>
            <div
              className="grid"
              style={{ '--min': '230px', opacity: query.isPlaceholderData ? 0.6 : 1 }}
            >
              {query.data.data.map((item) => (
                <EquipmentCard key={item.id} item={item} />
              ))}
            </div>
            <Pagination meta={query.data.meta} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </section>
    </div>
  );
}
