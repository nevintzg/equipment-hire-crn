import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, ErrorBox, Field, Spinner, useTitle, useToast } from '@equipment-hire/client/ui';
import { CONDITIONS, UNIT_STATUSES, dateTime, money, titleCase } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useOrg } from '../../lib/org.jsx';
import { useAuth } from '../../lib/auth.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import MoneyInput from '../../components/MoneyInput.jsx';

const BLANK = {
  name: '',
  slug: '',
  sku: '',
  categoryId: null,
  summary: '',
  description: '',
  status: 'DRAFT',
  inventoryMode: 'SERIALIZED',
  bulkQuantity: 0,
  bookingUnit: 'DAY',
  minHireUnits: 1,
  maxHireUnits: null,
  turnaroundHours: 0,
  minNoticeDays: 1,
  maxAdvanceDays: 365,
  maxPerBooking: null,
  bondCents: 0,
  replacementValueCents: null,
  requiresLicence: false,
  requiresTowing: false,
  requiresInduction: false,
  alwaysRequiresReview: false,
  weightKg: null,
  dimensions: '',
  safetyNotes: '',
  includedItems: '',
  pickupInstructions: '',
  sortOrder: 0,
};

/** The PUT replaces the whole record, so every field is always sent. */
function toPayload(v) {
  const out = {};
  for (const k of Object.keys(BLANK)) out[k] = v[k] ?? BLANK[k];
  for (const k of [
    'summary',
    'description',
    'dimensions',
    'safetyNotes',
    'includedItems',
    'pickupInstructions',
    'sku',
  ])
    out[k] = out[k] ?? '';
  if (!out.slug) delete out.slug;
  return out;
}

const num = (v, nullable) => (v === '' || v == null ? (nullable ? null : 0) : Number(v));

function DetailsForm({ item, onSaved }) {
  const org = useOrg();
  const { can } = useAuth();
  const [v, setV] = useState(() => ({ ...BLANK, ...(item ?? {}) }));
  const [errors, setErrors] = useState({});
  const set =
    (k, transform = (x) => x) =>
    (e) => {
      const raw = e?.target
        ? e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.value
        : e;
      setV((s) => ({ ...s, [k]: transform(raw) }));
    };
  const save = useMutation({
    mutationFn: () =>
      item
        ? api.put(`/admin/equipment/${item.id}`, toPayload(v))
        : api.post('/admin/equipment', toPayload(v)),
    onSuccess: onSaved,
    onError: (err) => setErrors(err.fieldErrors ?? {}),
  });
  const editable = can(item ? 'equipment.edit' : 'equipment.create');

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save.mutate();
      }}
    >
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Basics</h3>
        <div className="form-grid">
          <Field label="Name" error={errors.name} required>
            <input className="input" value={v.name} onChange={set('name')} />
          </Field>
          <Field
            label="Web address"
            hint="Leave blank to generate from the name"
            error={errors.slug}
          >
            <input
              className="input"
              value={v.slug ?? ''}
              onChange={set('slug')}
              placeholder="marquee-6x3"
            />
          </Field>
          <Field label="SKU" error={errors.sku}>
            <input className="input" value={v.sku ?? ''} onChange={set('sku')} />
          </Field>
          <Field label="Category" error={errors.categoryId}>
            <select
              className="input"
              value={v.categoryId ?? ''}
              onChange={set('categoryId', (x) => x || null)}
            >
              <option value="">None</option>
              {org.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? '— ' : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" error={errors.status}>
            <select className="input" value={v.status} onChange={set('status')}>
              <option value="DRAFT">Draft (hidden)</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>
          <Field label="Sort order" hint="Lower shows first">
            <input
              className="input"
              type="number"
              min={0}
              value={v.sortOrder}
              onChange={set('sortOrder', (x) => num(x))}
            />
          </Field>
        </div>
        <Field label="Summary" hint="One line, shown on the catalogue card" error={errors.summary}>
          <input
            className="input"
            value={v.summary ?? ''}
            onChange={set('summary')}
            maxLength={300}
          />
        </Field>
        <Field label="Description" hint="Markdown supported" error={errors.description}>
          <textarea
            className="input"
            rows={6}
            value={v.description ?? ''}
            onChange={set('description')}
          />
        </Field>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Stock and hire rules</h3>
        <div className="form-grid">
          <Field
            label="Inventory"
            hint={
              v.inventoryMode === 'BULK' ? 'A pool, e.g. 120 chairs' : 'Individually tracked units'
            }
          >
            <select
              className="input"
              value={v.inventoryMode}
              onChange={set('inventoryMode')}
              disabled={Boolean(item)}
            >
              <option value="SERIALIZED">Individual units</option>
              <option value="BULK">Bulk quantity</option>
            </select>
          </Field>
          {v.inventoryMode === 'BULK' && (
            <Field label="Quantity owned" error={errors.bulkQuantity}>
              <input
                className="input"
                type="number"
                min={0}
                value={v.bulkQuantity}
                onChange={set('bulkQuantity', (x) => num(x))}
              />
            </Field>
          )}
          <Field label="Charged per">
            <select className="input" value={v.bookingUnit} onChange={set('bookingUnit')}>
              <option value="DAY">Day</option>
              <option value="HOUR">Hour</option>
            </select>
          </Field>
          <Field label="Minimum hire" error={errors.minHireUnits}>
            <input
              className="input"
              type="number"
              min={1}
              value={v.minHireUnits}
              onChange={set('minHireUnits', (x) => num(x))}
            />
          </Field>
          <Field label="Maximum hire" hint="Blank for no limit" error={errors.maxHireUnits}>
            <input
              className="input"
              type="number"
              min={1}
              value={v.maxHireUnits ?? ''}
              onChange={set('maxHireUnits', (x) => num(x, true))}
            />
          </Field>
          <Field label="Max per booking" hint="Blank for no limit" error={errors.maxPerBooking}>
            <input
              className="input"
              type="number"
              min={1}
              value={v.maxPerBooking ?? ''}
              onChange={set('maxPerBooking', (x) => num(x, true))}
            />
          </Field>
          <Field label="Notice (days)" error={errors.minNoticeDays}>
            <input
              className="input"
              type="number"
              min={0}
              value={v.minNoticeDays}
              onChange={set('minNoticeDays', (x) => num(x))}
            />
          </Field>
          <Field label="Book up to (days ahead)" error={errors.maxAdvanceDays}>
            <input
              className="input"
              type="number"
              min={1}
              value={v.maxAdvanceDays}
              onChange={set('maxAdvanceDays', (x) => num(x))}
            />
          </Field>
          <Field label="Turnaround (hours)" hint="Cleaning time between hires">
            <input
              className="input"
              type="number"
              min={0}
              value={v.turnaroundHours}
              onChange={set('turnaroundHours', (x) => num(x))}
            />
          </Field>
          <Field label="Bond per item" error={errors.bondCents}>
            <MoneyInput value={v.bondCents} onChange={set('bondCents')} />
          </Field>
          <Field label="Replacement value">
            <MoneyInput
              value={v.replacementValueCents}
              allowNull
              onChange={set('replacementValueCents')}
            />
          </Field>
        </div>
        <div className="row" style={{ '--gap': '1.5rem' }}>
          {[
            ['requiresLicence', 'Needs a driver licence'],
            ['requiresTowing', 'Needs a tow vehicle'],
            ['requiresInduction', 'Needs an induction'],
            ['alwaysRequiresReview', 'Always review bookings'],
          ].map(([k, l]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={Boolean(v[k])} onChange={set(k)} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Details for customers</h3>
        <div className="form-grid">
          <Field label="Dimensions">
            <input className="input" value={v.dimensions ?? ''} onChange={set('dimensions')} />
          </Field>
          <Field label="Weight (kg)">
            <input
              className="input"
              type="number"
              min={0}
              value={v.weightKg ?? ''}
              onChange={set('weightKg', (x) => num(x, true))}
            />
          </Field>
        </div>
        <Field label="What's included">
          <textarea
            className="input"
            value={v.includedItems ?? ''}
            onChange={set('includedItems')}
          />
        </Field>
        <Field label="Safety notes">
          <textarea className="input" value={v.safetyNotes ?? ''} onChange={set('safetyNotes')} />
        </Field>
        <Field label="Collection instructions">
          <textarea
            className="input"
            value={v.pickupInstructions ?? ''}
            onChange={set('pickupInstructions')}
          />
        </Field>
      </div>

      <ErrorBox error={save.error} />
      {editable && (
        <div>
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : item ? 'Save changes' : 'Create item'}
          </button>
        </div>
      )}
    </form>
  );
}

const PERIODS = [
  ['PER_DAY', 'Per day'],
  ['PER_HOUR', 'Per hour'],
  ['PER_BOOKING', 'Per booking'],
  ['WEEKEND', 'Per weekend'],
  ['PER_WEEK', 'Per week'],
];

function PricingEditor({ item }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const types = useQuery({
    queryKey: ['customer-types'],
    queryFn: () => api.get('/site/customer-types'),
  });
  const [rates, setRates] = useState(() =>
    item.prices.map(
      ({ tierKind, customerTypeId, period, amountCents, fromUnit, maxChargeCents, isActive }) => ({
        tierKind,
        customerTypeId,
        period,
        amountCents,
        fromUnit,
        maxChargeCents,
        isActive,
      }),
    ),
  );
  const patch = (i, p) => setRates((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = useMutation({
    mutationFn: () => api.put(`/admin/equipment/${item.id}/prices`, { rates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-equipment', item.id] });
      toast('Rates saved');
    },
  });

  return (
    <div className="card stack">
      <div>
        <h3 style={{ margin: 0 }}>Rate card</h3>
        <p className="muted" style={{ margin: '0.25rem 0 0' }}>
          Base rates apply to everyone. A customer-type rate replaces the base rate for that group
          once their type is confirmed. &ldquo;From unit&rdquo; makes a cheaper rate kick in for
          longer hires.
        </p>
      </div>
      {rates.length === 0 && (
        <p className="subtle">No rates — this item would be free to borrow.</p>
      )}
      {rates.map((r, i) => (
        <div key={i} className="rate-row">
          <Field label="Applies to">
            <select
              className="input"
              value={r.tierKind === 'BASE' ? '' : r.customerTypeId}
              onChange={(e) =>
                patch(
                  i,
                  e.target.value
                    ? { tierKind: 'CUSTOMER_TYPE', customerTypeId: e.target.value }
                    : { tierKind: 'BASE', customerTypeId: null },
                )
              }
            >
              <option value="">Everyone (base)</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Period">
            <select
              className="input"
              value={r.period}
              onChange={(e) => patch(i, { period: e.target.value })}
            >
              {PERIODS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount">
            <MoneyInput value={r.amountCents} onChange={(x) => patch(i, { amountCents: x })} />
          </Field>
          <Field label="From unit">
            <input
              className="input"
              type="number"
              min={1}
              value={r.fromUnit}
              onChange={(e) => patch(i, { fromUnit: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label="Cap per line">
            <MoneyInput
              value={r.maxChargeCents}
              allowNull
              onChange={(x) => patch(i, { maxChargeCents: x })}
            />
          </Field>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRates((rs) => rs.filter((_, j) => j !== i))}
            aria-label="Remove rate"
          >
            ✕
          </button>
        </div>
      ))}
      <ErrorBox error={save.error} />
      {can('equipment.edit') && (
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              setRates((rs) => [
                ...rs,
                {
                  tierKind: 'BASE',
                  customerTypeId: null,
                  period: 'PER_DAY',
                  amountCents: 0,
                  fromUnit: 1,
                  maxChargeCents: null,
                  isActive: true,
                },
              ])
            }
          >
            + Add rate
          </button>
          <button
            className="btn btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            Save rates
          </button>
        </div>
      )}
    </div>
  );
}

const UNIT_TONE = {
  AVAILABLE: 'success',
  ON_HIRE: 'accent',
  MAINTENANCE: 'warning',
  DAMAGED: 'danger',
  LOST: 'danger',
  RETIRED: 'neutral',
};

function UnitsPanel({ item }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState({
    assetTag: '',
    serialNumber: '',
    status: 'AVAILABLE',
    condition: 'GOOD',
    notes: '',
  });
  const add = useMutation({
    mutationFn: () => {
      const body = { ...form };
      for (const k of ['serialNumber', 'notes']) if (!body[k]) delete body[k];
      return api.post(`/admin/equipment/${item.id}/units`, body);
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, assetTag: '', serialNumber: '', notes: '' }));
      qc.invalidateQueries({ queryKey: ['admin-equipment', item.id] });
    },
  });
  if (item.inventoryMode === 'BULK') {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          This item is tracked as a pool of {item.bulkQuantity}. Change the quantity on the Details
          tab.
        </p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="card card-flush">
        {item.units.length === 0 ? (
          <div className="empty">No units yet — add one below so this item can be booked.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset tag</th>
                <th>Serial</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {item.units.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.assetTag}</td>
                  <td className="mono">{u.serialNumber ?? '—'}</td>
                  <td>
                    <Badge tone={UNIT_TONE[u.status]}>{titleCase(u.status)}</Badge>
                  </td>
                  <td>{titleCase(u.condition)}</td>
                  <td className="muted">{u.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {can('inventory.manage') && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <h3 style={{ margin: 0 }}>Add a unit</h3>
          <div className="form-grid">
            <Field label="Asset tag" required>
              <input
                className="input"
                value={form.assetTag}
                onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
              />
            </Field>
            <Field label="Serial number">
              <input
                className="input"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select
                className="input"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                {CONDITIONS.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <ErrorBox error={add.error} />
          <div>
            <button className="btn btn-primary" disabled={!form.assetTag || add.isPending}>
              Add unit
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function BlocksPanel({ item }) {
  const org = useOrg();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState({
    unitId: '',
    quantity: 1,
    from: '',
    to: '',
    reason: 'MAINTENANCE',
    note: '',
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-equipment', item.id] });
  const add = useMutation({
    mutationFn: () =>
      api.post('/admin/availability/blocks', {
        equipmentId: item.id,
        unitId: form.unitId || null,
        quantity: Number(form.quantity) || 1,
        from: new Date(form.from).toISOString(),
        to: new Date(form.to).toISOString(),
        reason: form.reason,
        note: form.note || undefined,
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, from: '', to: '', note: '' }));
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`/admin/availability/blocks/${id}`),
    onSuccess: refresh,
  });
  const unitTag = (id) => item.units.find((u) => u.id === id)?.assetTag;

  return (
    <div className="stack">
      <div className="card card-flush">
        {item.blocks.length === 0 ? (
          <div className="empty">No upcoming blocked dates.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>What</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {item.blocks.map((b) => (
                <tr key={b.id}>
                  <td className="nowrap">{dateTime(b.startAt, org.tz)}</td>
                  <td className="nowrap">{dateTime(b.endAt, org.tz)}</td>
                  <td>{b.unitId ? unitTag(b.unitId) : `${b.quantity} from pool`}</td>
                  <td>
                    {titleCase(b.reason)}
                    {b.note && <div className="subtle">{b.note}</div>}
                  </td>
                  <td className="right">
                    {can('availability.manage') && (
                      <button
                        className="btn btn-sm"
                        onClick={() => remove.mutate(b.id)}
                        disabled={remove.isPending}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {can('availability.manage') && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <h3 style={{ margin: 0 }}>Block out dates</h3>
          <p className="muted" style={{ margin: 0 }}>
            For servicing, closures or internal use. Overlapping an existing booking is refused.
          </p>
          <div className="form-grid">
            {item.inventoryMode === 'SERIALIZED' ? (
              <Field label="Unit">
                <select
                  className="input"
                  value={form.unitId}
                  onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                >
                  <option value="">Choose a unit</option>
                  {item.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.assetTag}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Quantity">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </Field>
            )}
            <Field label="From">
              <input
                className="input"
                type="datetime-local"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
            </Field>
            <Field label="To">
              <input
                className="input"
                type="datetime-local"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            </Field>
            <Field label="Reason">
              <select
                className="input"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              >
                {['MAINTENANCE', 'CLOSURE', 'INTERNAL_USE', 'RESERVED'].map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Note">
            <input
              className="input"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
          <p className="subtle" style={{ margin: 0 }}>
            Times are in your browser&rsquo;s timezone.
          </p>
          <ErrorBox error={add.error ?? remove.error} />
          <div>
            <button
              className="btn btn-primary"
              disabled={
                add.isPending ||
                !form.from ||
                !form.to ||
                (item.inventoryMode === 'SERIALIZED' && !form.unitId)
              }
            >
              Block dates
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function EquipmentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const org = useOrg();
  const [tab, setTab] = useState('details');
  const isNew = !id;
  const q = useQuery({
    queryKey: ['admin-equipment', id],
    queryFn: () => api.get(`/admin/equipment/${id}`),
    enabled: !isNew,
  });
  const archive = useMutation({
    mutationFn: () => api.del(`/admin/equipment/${id}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin-equipment'] });
      toast(r.deleted ? 'Item deleted' : 'Item archived — it has booking history, so it was kept');
      navigate('/equipment');
    },
  });
  useTitle(isNew ? 'New equipment' : (q.data?.name ?? 'Equipment'), 'Admin');

  if (!isNew && q.isPending) return <Spinner />;
  if (!isNew && q.error) return <ErrorBox error={q.error} />;
  const item = q.data;

  const onSaved = (saved) => {
    qc.invalidateQueries({ queryKey: ['admin-equipment'] });
    toast(isNew ? 'Item created' : 'Changes saved');
    if (isNew) navigate(`/equipment/${saved.id}`, { replace: true });
  };

  return (
    <>
      <p>
        <Link to="/equipment">← Equipment</Link>
      </p>
      <PageHeader
        title={isNew ? 'New equipment' : item.name}
        subtitle={
          !isNew && item.status === 'PUBLISHED' ? `Live at /equipment/${item.slug}` : undefined
        }
      >
        {!isNew && can('equipment.delete') && (
          <button
            className="btn btn-danger"
            onClick={() =>
              window.confirm(`Archive ${item.name}? It will be hidden from the website.`) &&
              archive.mutate()
            }
            disabled={archive.isPending}
          >
            Archive
          </button>
        )}
      </PageHeader>
      <ErrorBox error={archive.error} />
      {!isNew && (
        <div className="tabs">
          {[
            ['details', 'Details'],
            ['pricing', `Pricing (${item.prices.length})`],
            ['units', item.inventoryMode === 'BULK' ? 'Stock' : `Units (${item.units.length})`],
            ['blocks', 'Blocked dates'],
          ].map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      )}
      {(isNew || tab === 'details') && (
        <DetailsForm key={item?.updatedAt ?? 'new'} item={item} onSaved={onSaved} />
      )}
      {!isNew && tab === 'pricing' && (
        <PricingEditor key={item.prices.map((p) => p.id).join()} item={item} />
      )}
      {!isNew && tab === 'units' && <UnitsPanel item={item} />}
      {!isNew && tab === 'blocks' && <BlocksPanel item={item} />}
      {!isNew && item.bondCents > 0 && tab === 'details' && (
        <p className="subtle" style={{ marginTop: '1rem' }}>
          Customers pay a {money(item.bondCents, org.currency)} bond per item, refunded after
          inspection.
        </p>
      )}
    </>
  );
}
