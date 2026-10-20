import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, ErrorBox, Spinner, StatusBadge, useTitle } from '@equipment-hire/client/ui';
import {
  dateTime,
  fullName,
  money,
  relative,
  statusLabel,
  titleCase,
} from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useOrg } from '../../lib/org.jsx';
import { useAuth } from '../../lib/auth.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import {
  ApproveDialog,
  CancelDialog,
  InspectionDialog,
  ManualPaymentDialog,
  PickupDialog,
  RefundDialog,
  RejectDialog,
  ReturnDialog,
} from './BookingActions.jsx';

export default function BookingDetail() {
  const { id } = useParams();
  const org = useOrg();
  const { can } = useAuth();
  const [dialog, setDialog] = useState(null);
  const {
    data: b,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get(`/admin/bookings/${id}`),
  });
  useTitle(b ? `Booking ${b.reference}` : 'Booking', 'Admin');

  if (isPending) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const cur = org.currency;
  const tz = org.tz;
  const s = b.storedStatus;
  const paidCents = b.payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((n, p) => n + p.amountCents - (p.refundedCents ?? 0), 0);
  const pendingRefunds = b.refunds
    .filter((r) => r.status !== 'FAILED' && r.status !== 'SUCCEEDED')
    .reduce((n, r) => n + r.amountCents, 0);
  const refundable = Math.max(0, paidCents - pendingRefunds);
  const props = {
    booking: b,
    onClose: () => setDialog(null),
    currency: cur,
    paidCents: refundable,
  };

  const actions = [
    s === 'PENDING_REVIEW' &&
      can('booking.approve') && {
        key: 'approve',
        label: 'Approve',
        primary: true,
        C: ApproveDialog,
      },
    s === 'PENDING_REVIEW' &&
      can('booking.approve') && { key: 'reject', label: 'Decline', C: RejectDialog },
    s === 'APPROVED' &&
      can('payment.record') && {
        key: 'manual',
        label: 'Record payment',
        primary: true,
        C: ManualPaymentDialog,
      },
    s === 'CONFIRMED' &&
      can('booking.handover') && {
        key: 'pickup',
        label: 'Record collection',
        primary: true,
        C: PickupDialog,
      },
    s === 'PICKED_UP' &&
      can('booking.handover') && {
        key: 'return',
        label: 'Record return',
        primary: true,
        C: ReturnDialog,
      },
    s === 'RETURNED' &&
      can('booking.inspect') && {
        key: 'inspect',
        label: 'Inspect & settle bond',
        primary: true,
        C: InspectionDialog,
      },
    refundable > 0 && can('payment.refund') && { key: 'refund', label: 'Refund', C: RefundDialog },
    ['PENDING_REVIEW', 'APPROVED', 'CONFIRMED'].includes(s) &&
      can('booking.cancel') && {
        key: 'cancel',
        label: 'Cancel booking',
        danger: true,
        C: CancelDialog,
      },
  ].filter(Boolean);
  const Active = actions.find((a) => a.key === dialog)?.C;

  const u = b.user;
  return (
    <>
      <p>
        <Link to="/bookings">← Bookings</Link>
      </p>
      <PageHeader
        title={
          <span className="row" style={{ '--gap': '0.6rem' }}>
            <span className="mono">{b.reference}</span>
            <StatusBadge status={b.status} />
          </span>
        }
        subtitle={`Received ${dateTime(b.createdAt, tz)}${b.autoApproved ? ' · auto-approved' : ''}`}
      >
        <div className="actions-bar">
          {actions.map((a) => (
            <button
              key={a.key}
              className={`btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : ''}`}
              onClick={() => setDialog(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {b.status === 'APPROVED' && b.paymentDueAt && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          Waiting for payment — expires {relative(b.paymentDueAt)} ({dateTime(b.paymentDueAt, tz)}).
        </div>
      )}
      {b.status === 'OVERDUE' && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          Return was due {relative(b.endAt)}. Contact the customer.
        </div>
      )}

      <div className="two-col">
        <div className="stack">
          <div className="card">
            <h3>Hire</h3>
            <dl className="kv">
              <dt>Collect</dt>
              <dd>
                {dateTime(b.startAt, tz)}
                {b.pickupLocation && <span className="subtle"> · {b.pickupLocation.name}</span>}
              </dd>
              <dt>Return</dt>
              <dd>
                {dateTime(b.endAt, tz)}
                {b.returnLocation && <span className="subtle"> · {b.returnLocation.name}</span>}
              </dd>
              <dt>Length</dt>
              <dd>
                {b.chargeableUnits} {b.bookingUnit === 'HOUR' ? 'hour(s)' : 'day(s)'}
              </dd>
              {b.purpose && (
                <>
                  <dt>Purpose</dt>
                  <dd>{b.purpose}</dd>
                </>
              )}
              {b.expectedAttendees != null && (
                <>
                  <dt>Attendees</dt>
                  <dd>{b.expectedAttendees}</dd>
                </>
              )}
              {b.deliveryRequired && (
                <>
                  <dt>Delivery</dt>
                  <dd>{b.deliveryAddress || 'Requested'}</dd>
                </>
              )}
              {b.customerNotes && (
                <>
                  <dt>Customer notes</dt>
                  <dd style={{ whiteSpace: 'pre-line' }}>{b.customerNotes}</dd>
                </>
              )}
              {b.staffNotes && (
                <>
                  <dt>Staff notes</dt>
                  <dd style={{ whiteSpace: 'pre-line' }}>{b.staffNotes}</dd>
                </>
              )}
              {b.rejectionReason && (
                <>
                  <dt>Declined because</dt>
                  <dd>{b.rejectionReason}</dd>
                </>
              )}
              {b.cancellationReason && (
                <>
                  <dt>Cancelled because</dt>
                  <dd>{b.cancellationReason}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="card card-flush">
            <div style={{ padding: '1rem 1rem 0.5rem' }}>
              <h3 style={{ margin: 0 }}>Items</h3>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="right">Qty</th>
                    <th>Units</th>
                    <th className="right">Rate</th>
                    <th className="right">Hire</th>
                    <th className="right">Bond</th>
                  </tr>
                </thead>
                <tbody>
                  {b.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.equipment ? (
                          <Link to={`/equipment/${i.equipmentId}`}>{i.nameSnapshot}</Link>
                        ) : (
                          i.nameSnapshot
                        )}
                        {i.notes && <div className="subtle">{i.notes}</div>}
                      </td>
                      <td className="right">{i.quantity}</td>
                      <td>
                        {b.allocations
                          .filter((a) => a.bookingItemId === i.id)
                          .map((a) => (
                            <Badge key={a.id}>{a.unit?.assetTag}</Badge>
                          ))}
                      </td>
                      <td className="right nowrap">{money(i.unitRateCents, cur)}</td>
                      <td className="right">{money(i.lineHireCents, cur)}</td>
                      <td className="right">{money(i.lineBondCents, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0.75rem 1rem', maxWidth: 340, marginLeft: 'auto' }}>
              <dl className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
                <dt>Hire subtotal</dt>
                <dd className="right">{money(b.hireSubtotalCents, cur)}</dd>
                {b.discountCents > 0 && (
                  <>
                    <dt>Discount</dt>
                    <dd className="right">−{money(b.discountCents, cur)}</dd>
                  </>
                )}
                <dt>Bond</dt>
                <dd className="right">{money(b.bondTotalCents, cur)}</dd>
                {b.lateFeeCents > 0 && (
                  <>
                    <dt>Late fee</dt>
                    <dd className="right">{money(b.lateFeeCents, cur)}</dd>
                  </>
                )}
                <dt>
                  <strong>Total</strong>
                </dt>
                <dd className="right">
                  <strong>{money(b.totalDueCents, cur)}</strong>
                </dd>
                <dt>GST included</dt>
                <dd className="right">{money(b.gstCents, cur)}</dd>
              </dl>
            </div>
          </div>

          {b.answers.length > 0 && (
            <div className="card">
              <h3>Checkout answers</h3>
              <dl className="kv">
                {b.answers.map((a) => (
                  <div key={a.id} style={{ display: 'contents' }}>
                    <dt>{a.labelSnapshot}</dt>
                    <dd>{a.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {b.inspection && (
            <div className="card">
              <h3>Inspection</h3>
              <dl className="kv">
                <dt>Signed off</dt>
                <dd>{dateTime(b.inspection.signedOffAt, tz)}</dd>
                <dt>All returned</dt>
                <dd>{b.inspection.allItemsReturned ? 'Yes' : 'No'}</dd>
                <dt>Deductions</dt>
                <dd>{money(b.inspection.totalDeductionCents, cur)}</dd>
                <dt>Bond refund</dt>
                <dd>{money(b.inspection.bondRefundCents, cur)}</dd>
              </dl>
              {b.inspection.deductions?.length > 0 && (
                <ul>
                  {b.inspection.deductions.map((d) => (
                    <li key={d.id}>
                      {titleCase(d.kind)}: {d.description} — {money(d.amountCents, cur)}
                    </li>
                  ))}
                </ul>
              )}
              {b.inspection.summary && <p className="muted">{b.inspection.summary}</p>}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h3>Customer</h3>
            <p style={{ marginBottom: 6 }}>
              {can('customer.view') ? (
                <Link to={`/customers/${u.id}`}>{fullName(u)}</Link>
              ) : (
                <strong>{fullName(u)}</strong>
              )}
            </p>
            {u.hirerOrgName && <div>{u.hirerOrgName}</div>}
            <div>
              <a href={`mailto:${u.email}`}>{u.email}</a>
            </div>
            {u.phone && (
              <div>
                <a href={`tel:${u.phone.replace(/\s/g, '')}`}>{u.phone}</a>
              </div>
            )}
            <div className="row" style={{ marginTop: 8, '--gap': '0.4rem' }}>
              {u.emailVerifiedAt ? (
                <Badge tone="success">Email verified</Badge>
              ) : (
                <Badge tone="warning">Email not verified</Badge>
              )}
              {u.customerTypeConfirmedAt && <Badge tone="success">Type confirmed</Badge>}
              {u.blockedAt && <Badge tone="danger">Blocked</Badge>}
            </div>
          </div>

          <div className="card">
            <h3>Payments</h3>
            {b.payments.length === 0 && b.refunds.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No payments yet.
              </p>
            ) : (
              <ul className="plain-list">
                {b.payments.map((p) => (
                  <li key={p.id}>
                    <div className="spread">
                      <span>
                        {titleCase(p.method)}{' '}
                        <Badge
                          tone={
                            p.status === 'SUCCEEDED'
                              ? 'success'
                              : p.status === 'FAILED'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {titleCase(p.status)}
                        </Badge>
                      </span>
                      <strong>{money(p.amountCents, cur)}</strong>
                    </div>
                    <div className="subtle">
                      {p.paidAt ? dateTime(p.paidAt, tz) : dateTime(p.createdAt, tz)}
                      {p.manualReference && ` · ${p.manualReference}`}
                    </div>
                  </li>
                ))}
                {b.refunds.map((r) => (
                  <li key={r.id}>
                    <div className="spread">
                      <span>
                        Refund · {titleCase(r.reasonCode)} <Badge>{titleCase(r.status)}</Badge>
                      </span>
                      <strong>−{money(r.amountCents, cur)}</strong>
                    </div>
                    {r.failureReason && <div className="subtle">{r.failureReason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>History</h3>
            <ol className="timeline">
              <li>
                <strong>Submitted</strong>
                <div className="subtle">
                  {dateTime(b.submittedAt ?? b.createdAt, tz)} · {fullName(u)}
                </div>
              </li>
              {b.statusHistory.map((h) => (
                <li key={h.id}>
                  <strong>{statusLabel(h.toStatus)}</strong>
                  <div className="subtle">
                    {dateTime(h.createdAt, tz)} ·{' '}
                    {h.actor ? fullName(h.actor) : titleCase(h.actorKind)}
                  </div>
                  {h.reason && <div className="muted">{h.reason}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {Active && <Active {...props} />}
    </>
  );
}
