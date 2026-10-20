import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorBox, Field, Modal, useToast } from '@equipment-hire/client/ui';
import { CONDITIONS, money, titleCase } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import MoneyInput from '../../components/MoneyInput.jsx';

/** One mutation per dialog; every success refreshes the booking and lists. */
function useAction(booking, path, { onDone, message } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body) => api.post(path, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (message) toast(message);
      onDone?.();
    },
  });
}

function Footer({ m, onClose, label, danger, onSubmit, disabled }) {
  return (
    <>
      <button className="btn" onClick={onClose}>
        Close
      </button>
      <button
        className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
        disabled={m.isPending || disabled}
        onClick={onSubmit}
      >
        {m.isPending ? 'Saving…' : label}
      </button>
    </>
  );
}

export function ApproveDialog({ booking, onClose, currency }) {
  const [discountCents, setDiscount] = useState(0);
  const [hours, setHours] = useState('');
  const [staffNotes, setNotes] = useState(booking.staffNotes ?? '');
  const m = useAction(booking, `/admin/bookings/${booking.id}/approve`, {
    onDone: onClose,
    message: 'Booking approved — the customer has been emailed',
  });
  return (
    <Modal
      title={`Approve ${booking.reference}`}
      onClose={onClose}
      footer={
        <Footer
          m={m}
          onClose={onClose}
          label="Approve booking"
          onSubmit={() =>
            m.mutate({
              discountCents: discountCents || undefined,
              paymentWindowHours: hours ? Number(hours) : undefined,
              staffNotes: staffNotes || undefined,
            })
          }
        />
      }
    >
      <div className="stack">
        <p className="muted">
          The customer will be asked to pay {money(booking.totalDueCents - discountCents, currency)}{' '}
          to confirm.
          {booking.totalDueCents === 0 &&
            ' Nothing is owed, so it will be confirmed straight away.'}
        </p>
        <div className="grid-2">
          <Field label="Goodwill discount" hint="Taken off the hire fee, not the bond">
            <MoneyInput value={discountCents} onChange={setDiscount} />
          </Field>
          <Field label="Payment window (hours)" hint="Leave blank for the default">
            <input
              className="input"
              type="number"
              min={1}
              max={336}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Staff notes" hint="Not shown to the customer">
          <textarea
            className="input"
            value={staffNotes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export function RejectDialog({ booking, onClose }) {
  const [reason, setReason] = useState('');
  const m = useAction(booking, `/admin/bookings/${booking.id}/reject`, {
    onDone: onClose,
    message: 'Booking declined',
  });
  return (
    <Modal
      title={`Decline ${booking.reference}`}
      onClose={onClose}
      footer={
        <Footer
          m={m}
          onClose={onClose}
          danger
          label="Decline booking"
          disabled={!reason.trim()}
          onSubmit={() => m.mutate({ reason })}
        />
      }
    >
      <div className="stack">
        <Field label="Reason" hint="This is included in the email to the customer">
          <textarea
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </Field>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export function CancelDialog({ booking, onClose, paidCents, currency }) {
  const [reason, setReason] = useState('');
  const [refundCents, setRefund] = useState(0);
  const m = useAction(booking, `/admin/bookings/${booking.id}/cancel`, {
    onDone: onClose,
    message: 'Booking cancelled',
  });
  return (
    <Modal
      title={`Cancel ${booking.reference}`}
      onClose={onClose}
      footer={
        <Footer
          m={m}
          onClose={onClose}
          danger
          label="Cancel booking"
          onSubmit={() =>
            m.mutate({ reason: reason || undefined, refundCents: refundCents || undefined })
          }
        />
      }
    >
      <div className="stack">
        <Field label="Reason">
          <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {paidCents > 0 && (
          <Field
            label="Refund to customer"
            hint={`They have paid ${money(paidCents, currency)}. Staff cancellations do not apply the customer cancellation schedule.`}
          >
            <MoneyInput value={refundCents} onChange={(v) => setRefund(Math.min(v, paidCents))} />
          </Field>
        )}
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export function PickupDialog({ booking, onClose }) {
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState(() =>
    booking.allocations.map((a) => ({
      bookingItemId: a.bookingItemId,
      unitId: a.unitId,
      label: a.unit?.assetTag ?? 'Unit',
      condition: a.unit?.condition ?? 'GOOD',
      notes: '',
    })),
  );
  const m = useAction(booking, `/admin/bookings/${booking.id}/pickup`, {
    onDone: onClose,
    message: 'Marked as collected',
  });
  return (
    <Modal
      title="Record collection"
      wide
      onClose={onClose}
      footer={
        <Footer
          m={m}
          onClose={onClose}
          label="Mark as collected"
          onSubmit={() =>
            m.mutate({
              notes: notes || undefined,
              conditions: conditions.map(({ label: _l, notes: n, ...c }) => ({
                ...c,
                notes: n || undefined,
              })),
            })
          }
        />
      }
    >
      <div className="stack">
        {conditions.length > 0 && (
          <div>
            <h4 className="section-title">Condition at handover</h4>
            {conditions.map((c, i) => (
              <div key={c.unitId} className="row" style={{ marginBottom: 8 }}>
                <strong style={{ minWidth: 110 }}>{c.label}</strong>
                <select
                  className="input"
                  style={{ width: 'auto' }}
                  value={c.condition}
                  onChange={(e) =>
                    setConditions((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, condition: e.target.value } : x)),
                    )
                  }
                >
                  {CONDITIONS.map((k) => (
                    <option key={k} value={k}>
                      {titleCase(k)}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160 }}
                  placeholder="Notes (scratches, missing pegs…)"
                  value={c.notes}
                  onChange={(e) =>
                    setConditions((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
        <Field label="Handover notes">
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export function ReturnDialog({ booking, onClose }) {
  const [notes, setNotes] = useState('');
  const m = useAction(booking, `/admin/bookings/${booking.id}/return`, {
    onDone: onClose,
    message: 'Marked as returned',
  });
  const late = new Date(booking.endAt) < new Date();
  return (
    <Modal
      title="Record return"
      onClose={onClose}
      footer={
        <Footer
          m={m}
          onClose={onClose}
          label="Mark as returned"
          onSubmit={() => m.mutate({ notes: notes || undefined })}
        />
      }
    >
      <div className="stack">
        {late && (
          <div className="alert alert-warning">
            This return is late. Any configured late fee will be calculated and taken from the bond
            at inspection.
          </div>
        )}
        <p className="muted">
          Units go back into the available pool. The bond is settled when you complete the
          inspection.
        </p>
        <Field label="Notes">
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

const DEDUCTION_KINDS = ['DAMAGE', 'MISSING', 'CLEANING', 'LATE_RETURN', 'OTHER'];

export function InspectionDialog({ booking, onClose, currency }) {
  // One row per allocated unit (so damaged units are pulled from stock), and
  // one row per bulk line.
  const [items, setItems] = useState(() =>
    booking.items.flatMap((item) => {
      const allocs = booking.allocations.filter((a) => a.bookingItemId === item.id);
      if (allocs.length) {
        return allocs.map((a) => ({
          key: a.id,
          label: `${item.nameSnapshot} · ${a.unit?.assetTag ?? 'unit'}`,
          bookingItemId: item.id,
          unitId: a.unitId,
          max: 1,
          quantityReturned: 1,
          quantityMissing: 0,
          conditionOnReturn: 'GOOD',
          isDamaged: false,
          isCleaningRequired: false,
          notes: '',
        }));
      }
      return [
        {
          key: item.id,
          label: item.nameSnapshot,
          bookingItemId: item.id,
          max: item.quantity,
          quantityReturned: item.quantity,
          quantityMissing: 0,
          conditionOnReturn: 'GOOD',
          isDamaged: false,
          isCleaningRequired: false,
          notes: '',
        },
      ];
    }),
  );
  const [deductions, setDeductions] = useState([]);
  const [summary, setSummary] = useState('');
  const m = useAction(booking, `/admin/bookings/${booking.id}/inspection`, {
    onDone: onClose,
    message: 'Inspection complete — bond refund queued',
  });

  const patchItem = (i, patch) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const patchDeduction = (i, patch) =>
    setDeductions((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const deductionTotal =
    deductions.reduce((s, d) => s + (d.amountCents || 0), 0) + (booking.lateFeeCents ?? 0);
  const refund = Math.max(
    0,
    booking.bondTotalCents - Math.min(deductionTotal, booking.bondTotalCents),
  );

  const submit = () =>
    m.mutate({
      allItemsReturned: items.every((i) => i.quantityMissing === 0),
      summary: summary || undefined,
      items: items.map(({ key: _k, label: _l, max: _m, notes, ...i }) => ({
        ...i,
        notes: notes || undefined,
      })),
      deductions: deductions.filter((d) => d.amountCents > 0 && d.description.trim()),
    });

  return (
    <Modal
      title={`Return inspection · ${booking.reference}`}
      wide
      onClose={onClose}
      footer={<Footer m={m} onClose={onClose} label="Sign off inspection" onSubmit={submit} />}
    >
      <div className="stack">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Returned</th>
                <th>Missing</th>
                <th>Condition</th>
                <th>Damaged</th>
                <th>Needs cleaning</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.key}>
                  <td>{it.label}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 70 }}
                      type="number"
                      min={0}
                      max={it.max}
                      value={it.quantityReturned}
                      onChange={(e) => {
                        const r = Math.max(0, Math.min(it.max, Number(e.target.value) || 0));
                        patchItem(i, { quantityReturned: r, quantityMissing: it.max - r });
                      }}
                    />
                  </td>
                  <td>{it.quantityMissing}</td>
                  <td>
                    <select
                      className="input"
                      value={it.conditionOnReturn}
                      onChange={(e) => patchItem(i, { conditionOnReturn: e.target.value })}
                    >
                      {CONDITIONS.map((k) => (
                        <option key={k} value={k}>
                          {titleCase(k)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={it.isDamaged}
                      onChange={(e) => patchItem(i, { isDamaged: e.target.checked })}
                      aria-label="Damaged"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={it.isCleaningRequired}
                      onChange={(e) => patchItem(i, { isCleaningRequired: e.target.checked })}
                      aria-label="Needs cleaning"
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={it.notes}
                      onChange={(e) => patchItem(i, { notes: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="spread">
            <h4 className="section-title" style={{ margin: 0 }}>
              Bond deductions
            </h4>
            <button
              className="btn btn-sm"
              onClick={() =>
                setDeductions((d) => [...d, { kind: 'DAMAGE', amountCents: 0, description: '' }])
              }
            >
              + Add deduction
            </button>
          </div>
          {deductions.map((d, i) => (
            <div key={i} className="row" style={{ marginTop: 8 }}>
              <select
                className="input"
                style={{ width: 'auto' }}
                value={d.kind}
                onChange={(e) => patchDeduction(i, { kind: e.target.value })}
              >
                {DEDUCTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {titleCase(k)}
                  </option>
                ))}
              </select>
              <div style={{ width: 130 }}>
                <MoneyInput
                  value={d.amountCents}
                  onChange={(v) => patchDeduction(i, { amountCents: v })}
                  aria-label="Amount"
                />
              </div>
              <input
                className="input"
                style={{ flex: 1, minWidth: 180 }}
                placeholder="What it covers (shown to the customer)"
                value={d.description}
                onChange={(e) => patchDeduction(i, { description: e.target.value })}
              />
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setDeductions((xs) => xs.filter((_, j) => j !== i))}
                aria-label="Remove deduction"
              >
                ✕
              </button>
            </div>
          ))}
          {booking.lateFeeCents > 0 && (
            <p className="subtle">
              Late fee of {money(booking.lateFeeCents, currency)} will also be deducted.
            </p>
          )}
        </div>

        <Field label="Summary">
          <textarea
            className="input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>

        <div className="alert alert-info">
          Bond held {money(booking.bondTotalCents, currency)} · deductions{' '}
          {money(Math.min(deductionTotal, booking.bondTotalCents), currency)} ·{' '}
          <strong>refund {money(refund, currency)}</strong>
        </div>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export function ManualPaymentDialog({ booking, onClose, currency }) {
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [hire, setHire] = useState(booking.totalDueCents - booking.bondTotalCents);
  const [bond, setBond] = useState(booking.bondTotalCents);
  const [reference, setReference] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () =>
      api.post(`/admin/payments/bookings/${booking.id}/manual`, {
        method,
        hireAmountCents: hire,
        bondAmountCents: bond,
        reference: reference || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast('Payment recorded');
      onClose();
    },
  });
  return (
    <Modal
      title="Record a payment"
      onClose={onClose}
      footer={<Footer m={m} onClose={onClose} label="Record payment" onSubmit={() => m.mutate()} />}
    >
      <div className="stack">
        <Field label="Method">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CASH">Cash</option>
            <option value="WAIVED">Waived</option>
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Hire amount">
            <MoneyInput value={hire} onChange={setHire} />
          </Field>
          <Field label="Bond amount">
            <MoneyInput value={bond} onChange={setBond} />
          </Field>
        </div>
        <Field label="Reference" hint="Bank reference or receipt number">
          <input
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <p className="subtle">
          Total {money(hire + bond, currency)} of {money(booking.totalDueCents, currency)} due.
        </p>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export function RefundDialog({ booking, onClose, paidCents, currency }) {
  const [amountCents, setAmount] = useState(0);
  const [reasonCode, setReasonCode] = useState('GOODWILL');
  const [reasonNote, setNote] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () =>
      api.post(`/admin/payments/bookings/${booking.id}/refund`, {
        amountCents,
        reasonCode,
        reasonNote: reasonNote || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast('Refund queued');
      onClose();
    },
  });
  return (
    <Modal
      title="Issue a refund"
      onClose={onClose}
      footer={
        <Footer
          m={m}
          onClose={onClose}
          label="Queue refund"
          disabled={!amountCents}
          onSubmit={() => m.mutate()}
        />
      }
    >
      <div className="stack">
        <p className="muted">
          Refundable balance: {money(paidCents, currency)}. Card refunds are sent to Stripe by the
          next scheduled run.
        </p>
        <div className="grid-2">
          <Field label="Amount">
            <MoneyInput value={amountCents} onChange={(v) => setAmount(Math.min(v, paidCents))} />
          </Field>
          <Field label="Reason">
            <select
              className="input"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              <option value="GOODWILL">Goodwill</option>
              <option value="CANCELLATION">Cancellation</option>
              <option value="BOND_RETURN">Bond return</option>
              <option value="OVERPAYMENT">Overpayment</option>
            </select>
          </Field>
        </div>
        <Field label="Note">
          <input className="input" value={reasonNote} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}
