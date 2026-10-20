import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  ErrorBox,
  Field,
  Spinner,
  StatusBadge,
  useTitle,
  useToast,
} from '@equipment-hire/client/ui';
import { date, dateRange, dateTime, fullName, money } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useOrg } from '../lib/org.jsx';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const org = useOrg();
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/admin/customers/${id}`),
  });
  const types = useQuery({
    queryKey: ['customer-types'],
    queryFn: () => api.get('/site/customer-types'),
  });
  const [notes, setNotes] = useState(null);
  const update = useMutation({
    mutationFn: (body) => api.patch(`/admin/customers/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(['customer', id], data);
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast('Customer updated');
    },
  });
  useTitle(q.data ? fullName(q.data) : 'Customer', 'Admin');

  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data;

  return (
    <>
      <p>
        <Link to="/customers">← Customers</Link>
      </p>
      <PageHeader title={fullName(c)} subtitle={`Customer since ${date(c.createdAt, org.tz)}`}>
        {can('customer.block') &&
          (c.blockedAt ? (
            <button className="btn" onClick={() => update.mutate({ blocked: false })}>
              Unblock
            </button>
          ) : (
            <button
              className="btn btn-danger"
              onClick={() => {
                const reason = window.prompt('Why is this account being blocked? (kept on file)');
                if (reason !== null)
                  update.mutate({ blocked: true, blockedReason: reason || undefined });
              }}
            >
              Block account
            </button>
          ))}
      </PageHeader>
      <ErrorBox error={update.error} />
      {c.blockedAt && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          Blocked {dateTime(c.blockedAt, org.tz)}
          {c.blockedReason ? ` — ${c.blockedReason}` : ''}
        </div>
      )}
      <div className="two-col">
        <div className="card card-flush">
          <div style={{ padding: '1rem 1rem 0.5rem' }}>
            <h3 style={{ margin: 0 }}>Bookings</h3>
          </div>
          {c.bookings.length === 0 ? (
            <div className="empty">No bookings yet.</div>
          ) : (
            <table className="table">
              <tbody>
                {c.bookings.map((b) => (
                  <tr
                    key={b.id}
                    className="clickable"
                    onClick={() => navigate(`/bookings/${b.id}`)}
                  >
                    <td className="mono">{b.reference}</td>
                    <td className="nowrap">{dateRange(b.startAt, b.endAt, org.tz)}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="right">{money(b.totalDueCents, org.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h3>Contact</h3>
            <dl className="kv">
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${c.email}`}>{c.email}</a>{' '}
                {c.emailVerified ? (
                  <Badge tone="success">verified</Badge>
                ) : (
                  <Badge tone="warning">unverified</Badge>
                )}
              </dd>
              <dt>Phone</dt>
              <dd>{c.phone ?? '—'}</dd>
              <dt>Organisation</dt>
              <dd>{c.hirerOrgName ?? '—'}</dd>
              <dt>ABN</dt>
              <dd>{c.hirerAbn ?? '—'}</dd>
              <dt>Address</dt>
              <dd>
                {[
                  c.address.line1,
                  c.address.line2,
                  c.address.suburb,
                  c.address.state,
                  c.address.postcode,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
              <dt>Last sign-in</dt>
              <dd>{c.lastLoginAt ? dateTime(c.lastLoginAt, org.tz) : '—'}</dd>
            </dl>
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Customer type</h3>
            <p className="muted" style={{ margin: 0 }}>
              Discounted rates apply only once the type is confirmed.
            </p>
            <Field label="Type">
              <select
                className="input"
                value={c.customerTypeId ?? ''}
                disabled={!can('customer.verify') || update.isPending}
                onChange={(e) => update.mutate({ customerTypeId: e.target.value || null })}
              >
                <option value="">None</option>
                {(types.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            {c.customerTypeId && (
              <div className="spread">
                {c.customerTypeConfirmed ? (
                  <Badge tone="success">Confirmed</Badge>
                ) : (
                  <Badge tone="warning">Not confirmed</Badge>
                )}
                {can('customer.verify') && (
                  <button
                    className="btn btn-sm"
                    onClick={() => update.mutate({ confirmCustomerType: !c.customerTypeConfirmed })}
                    disabled={update.isPending}
                  >
                    {c.customerTypeConfirmed ? 'Remove confirmation' : 'Confirm type'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Staff notes</h3>
            <textarea
              className="input"
              value={notes ?? c.staffNotes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!can('customer.edit')}
              rows={4}
            />
            {can('customer.edit') && notes !== null && notes !== (c.staffNotes ?? '') && (
              <div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    update.mutate({ staffNotes: notes }, { onSuccess: () => setNotes(null) })
                  }
                  disabled={update.isPending}
                >
                  Save notes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
