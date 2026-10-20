import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, ErrorBox, Field, Modal, Spinner, useToast } from '@equipment-hire/client/ui';
import { money } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useOrg } from '../../lib/org.jsx';
import MoneyInput from '../../components/MoneyInput.jsx';

/** The closed vocabulary the API understands — nothing else can be expressed. */
const NUMERIC = [
  ['maxTotalCents', 'Total is at most', 'money'],
  ['maxItems', 'No more than this many items'],
  ['maxDays', 'Hire is at most (days)'],
  ['minNoticeDays', 'Booked at least (days) ahead'],
  ['minCompletedBookings', 'Customer has completed at least (bookings)'],
];
const FLAGS = [
  ['requireVerifiedEmail', 'Customer has verified their email'],
  ['requireConfirmedCustomerType', 'Customer type is confirmed'],
  ['requireNoOverdueHistory', 'Customer has never returned late'],
  ['excludeBondedItems', 'No items carry a bond'],
];

function describe(rule, currency) {
  const c = rule.conditions ?? {};
  const parts = [];
  if (c.maxTotalCents != null) parts.push(`total ≤ ${money(c.maxTotalCents, currency)}`);
  if (c.maxItems != null) parts.push(`≤ ${c.maxItems} items`);
  if (c.maxDays != null) parts.push(`≤ ${c.maxDays} days`);
  if (c.minNoticeDays != null) parts.push(`≥ ${c.minNoticeDays} days notice`);
  if (c.minCompletedBookings != null) parts.push(`≥ ${c.minCompletedBookings} past bookings`);
  for (const [k, l] of FLAGS) if (c[k]) parts.push(l.toLowerCase());
  return parts.join(' · ') || 'always';
}

function RuleDialog({ rule, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const org = useOrg();
  const types = useQuery({
    queryKey: ['customer-types'],
    queryFn: () => api.get('/site/customer-types'),
  });
  const [v, setV] = useState({
    name: rule?.name ?? '',
    priority: rule?.priority ?? 100,
    customerTypeId: rule?.customerTypeId ?? null,
    categoryId: rule?.categoryId ?? null,
    approve: rule?.approve ?? true,
    isActive: rule?.isActive ?? true,
    conditions: rule?.conditions ?? {},
  });
  const setCond = (k, val) =>
    setV((s) => {
      const conditions = { ...s.conditions };
      if (val === null || val === undefined || val === '' || val === false) delete conditions[k];
      else conditions[k] = val;
      return { ...s, conditions };
    });
  const m = useMutation({
    mutationFn: () =>
      rule
        ? api.put(`/admin/settings/auto-approval/${rule.id}`, v)
        : api.post('/admin/settings/auto-approval', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-approval'] });
      toast('Rule saved');
      onClose();
    },
  });
  return (
    <Modal
      title={rule ? 'Edit rule' : 'New rule'}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => m.mutate()}
            disabled={!v.name || m.isPending}
          >
            Save rule
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <Field label="Name">
            <input
              className="input"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="Priority" hint="Lower is checked first">
            <input
              className="input"
              type="number"
              min={1}
              max={1000}
              value={v.priority}
              onChange={(e) => setV({ ...v, priority: Number(e.target.value) || 100 })}
            />
          </Field>
          <Field label="Outcome">
            <select
              className="input"
              value={v.approve ? 'approve' : 'review'}
              onChange={(e) => setV({ ...v, approve: e.target.value === 'approve' })}
            >
              <option value="approve">Approve automatically</option>
              <option value="review">Send for review</option>
            </select>
          </Field>
          <Field label="Only for customer type">
            <select
              className="input"
              value={v.customerTypeId ?? ''}
              onChange={(e) => setV({ ...v, customerTypeId: e.target.value || null })}
            >
              <option value="">Any</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Only for category">
            <select
              className="input"
              value={v.categoryId ?? ''}
              onChange={(e) => setV({ ...v, categoryId: e.target.value || null })}
            >
              <option value="">Any</option>
              {org.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <h4 className="section-title" style={{ margin: '0.5rem 0 0' }}>
          Applies when all of these are true
        </h4>
        <div className="form-grid">
          {NUMERIC.map(([k, l, kind]) => (
            <Field key={k} label={l} hint="Blank to ignore">
              {kind === 'money' ? (
                <MoneyInput
                  value={v.conditions[k] ?? null}
                  allowNull
                  onChange={(x) => setCond(k, x)}
                />
              ) : (
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={v.conditions[k] ?? ''}
                  onChange={(e) =>
                    setCond(k, e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              )}
            </Field>
          ))}
        </div>
        {FLAGS.map(([k, l]) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={Boolean(v.conditions[k])}
              onChange={(e) => setCond(k, e.target.checked)}
            />
            <span>{l}</span>
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={v.isActive}
            onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          />
          <span>Rule is active</span>
        </label>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export default function AutoApproval() {
  const org = useOrg();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const q = useQuery({
    queryKey: ['auto-approval'],
    queryFn: () => api.get('/admin/settings/auto-approval'),
  });
  const del = useMutation({
    mutationFn: (id) => api.del(`/admin/settings/auto-approval/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-approval'] }),
  });
  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div className="stack">
      <div className="card spread">
        <p className="muted" style={{ margin: 0, maxWidth: '70ch' }}>
          Rules are checked in priority order and the first match decides. Equipment marked
          &ldquo;always review&rdquo; is never auto-approved, whatever the rules say. With no
          matching rule, a booking waits for review.
        </p>
        {can('settings.manage') && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            New rule
          </button>
        )}
      </div>
      <div className="card card-flush">
        {q.data.length === 0 ? (
          <div className="empty">No rules — every booking is reviewed by staff.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Rule</th>
                <th>When</th>
                <th>Outcome</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.55 }}>
                  <td>{r.priority}</td>
                  <td>
                    <strong>{r.name}</strong>
                    {!r.isActive && <div className="subtle">inactive</div>}
                  </td>
                  <td className="muted">{describe(r, org.currency)}</td>
                  <td>
                    {r.approve ? (
                      <Badge tone="success">Approve</Badge>
                    ) : (
                      <Badge tone="warning">Review</Badge>
                    )}
                  </td>
                  <td className="right nowrap">
                    {can('settings.manage') && (
                      <>
                        <button className="btn btn-sm" onClick={() => setEditing(r)}>
                          Edit
                        </button>{' '}
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => window.confirm(`Delete “${r.name}”?`) && del.mutate(r.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ErrorBox error={del.error} />
      {editing && (
        <RuleDialog rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
