import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBox, Field, Modal, Spinner, StatusBadge, useTitle } from '@equipment-hire/client/ui';
import {
  BOOKING_STATUS,
  dateTime,
  money,
  relative,
  statusLabel,
  titleCase,
} from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useSite } from '../../lib/site.jsx';

function CancelDialog({ booking, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api.post(`/bookings/${booking.reference}/cancel`, { reason: reason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', booking.reference] });
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });
  return (
    <Modal
      title={m.isSuccess ? 'Booking cancelled' : 'Cancel this booking?'}
      onClose={onClose}
      footer={
        m.isSuccess ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Keep booking
            </button>
            <button className="btn btn-danger" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </>
        )
      }
    >
      {m.isSuccess ? (
        <div className="stack">
          <p>{m.data.refund.explanation}</p>
          {m.data.refund.amountCents > 0 && (
            <div className="alert alert-success">
              A refund of {money(m.data.refund.amountCents)} will be returned to your card within a
              few days.
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          <p className="muted">
            Any refund follows our cancellation policy, based on how close it is to your collection
            date. Your bond is always refunded in full.
          </p>
          <Field label="Reason (optional)">
            <textarea
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </Field>
          <ErrorBox error={m.error} />
        </div>
      )}
    </Modal>
  );
}

export default function MyBooking() {
  const { reference } = useParams();
  const site = useSite();
  const [cancelling, setCancelling] = useState(false);
  useTitle(`Booking ${reference}`, site.name);
  const {
    data: b,
    isPending,
    error,
  } = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => api.get(`/bookings/${reference}`),
  });

  if (isPending) return <Spinner />;
  if (error) return <ErrorBox error={error} />;

  const tz = site.tz;
  const cur = site.currency;
  const paid = b.payments.filter((p) => p.status === 'SUCCEEDED');
  const refunds = b.refunds.filter((r) => r.status !== 'FAILED');

  return (
    <div className="stack">
      <Link to="/account/bookings">← All bookings</Link>
      <div className="card stack">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }} className="mono">
              {b.reference}
            </h2>
            <span className="muted">{BOOKING_STATUS[b.status]?.customer}</span>
          </div>
          <StatusBadge status={b.status} />
        </div>

        {b.status === 'APPROVED' && (
          <div className="alert alert-info spread">
            <span>
              Approved! Pay {money(b.totalDueCents, cur)} to confirm
              {b.paymentDueAt ? ` — due ${relative(b.paymentDueAt)}` : ''}.
            </span>
            <Link to={`/bookings/${b.reference}/pay`} className="btn btn-primary btn-sm">
              Pay now
            </Link>
          </div>
        )}
        {b.status === 'REJECTED' && b.rejectionReason && (
          <div className="alert alert-error">{b.rejectionReason}</div>
        )}

        <dl className="kv">
          <dt>Collect</dt>
          <dd>{dateTime(b.startAt, tz)}</dd>
          <dt>Return</dt>
          <dd>{dateTime(b.endAt, tz)}</dd>
          {b.purpose && (
            <>
              <dt>For</dt>
              <dd>{b.purpose}</dd>
            </>
          )}
          {b.customerNotes && (
            <>
              <dt>Your notes</dt>
              <dd>{b.customerNotes}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card">
        <h3>Items</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th className="right">Hire</th>
                <th className="right">Bond</th>
              </tr>
            </thead>
            <tbody>
              {b.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.nameSnapshot}</td>
                  <td className="right">{i.quantity}</td>
                  <td className="right">{money(i.lineHireCents, cur)}</td>
                  <td className="right">{money(i.lineBondCents, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ maxWidth: 340, marginLeft: 'auto', marginTop: '1rem' }}>
          <div className="summary-row">
            <span>Hire</span>
            <span>{money(b.hireSubtotalCents, cur)}</span>
          </div>
          {b.discountCents > 0 && (
            <div className="summary-row">
              <span>Discount</span>
              <span>−{money(b.discountCents, cur)}</span>
            </div>
          )}
          {b.bondTotalCents > 0 && (
            <div className="summary-row">
              <span>Bond (refundable)</span>
              <span>{money(b.bondTotalCents, cur)}</span>
            </div>
          )}
          <div className="summary-row summary-total">
            <span>Total</span>
            <span>{money(b.totalDueCents, cur)}</span>
          </div>
          <div className="subtle right">incl. {money(b.gstCents, cur)} GST</div>
        </div>
      </div>

      {(paid.length > 0 || refunds.length > 0) && (
        <div className="card">
          <h3>Payments</h3>
          <ul className="plain">
            {paid.map((p) => (
              <li key={p.id} className="spread">
                <span>
                  {titleCase(p.method)} · {dateTime(p.paidAt, tz)}
                </span>
                <strong>{money(p.amountCents, cur)}</strong>
              </li>
            ))}
            {refunds.map((r) => (
              <li key={r.id} className="spread">
                <span>
                  Refund ({titleCase(r.reasonCode)}) · {titleCase(r.status)}
                </span>
                <strong>−{money(r.amountCents, cur)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {b.inspection && (
        <div className="card">
          <h3>Return inspection</h3>
          <p>
            Bond refunded: <strong>{money(b.inspection.bondRefundCents, cur)}</strong>
          </p>
          {b.inspection.deductions?.length > 0 && (
            <ul>
              {b.inspection.deductions.map((d) => (
                <li key={d.id}>
                  {d.description} — {money(d.amountCents, cur)}
                </li>
              ))}
            </ul>
          )}
          {b.inspection.summary && <p className="muted">{b.inspection.summary}</p>}
        </div>
      )}

      <div className="card">
        <h3>History</h3>
        <ol className="timeline">
          <li>
            <strong>Request submitted</strong>
            <div className="subtle">{dateTime(b.submittedAt ?? b.createdAt, tz)}</div>
          </li>
          {b.statusHistory.map((h) => (
            <li key={h.id}>
              <strong>{statusLabel(h.toStatus)}</strong>
              <div className="subtle">{dateTime(h.createdAt, tz)}</div>
              {h.reason && h.actorKind !== 'SYSTEM' && <div className="muted">{h.reason}</div>}
            </li>
          ))}
        </ol>
      </div>

      {b.canCancel && (
        <div>
          <button className="btn btn-danger" onClick={() => setCancelling(true)}>
            Cancel booking
          </button>
        </div>
      )}
      {cancelling && <CancelDialog booking={b} onClose={() => setCancelling(false)} />}
    </div>
  );
}
