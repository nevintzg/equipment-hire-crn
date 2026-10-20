import { money, plural } from '@equipment-hire/client';
import { Spinner, ErrorBox } from '@equipment-hire/client/ui';
import { useSite } from '../lib/site.jsx';

/** Server-calculated price breakdown. Never computed on the client. */
export default function QuoteSummary({ quote }) {
  const { currency } = useSite();
  if (quote.isPending && quote.fetchStatus === 'idle') return null;
  if (quote.isPending) return <Spinner label="Pricing your hire" />;
  if (quote.isError) return <ErrorBox error={quote.error} />;
  const q = quote.data;
  return (
    <div>
      {q.lines.map((l) => (
        <div className="summary-row" key={l.equipmentId}>
          <span>
            {l.quantity} × {l.name}
            {l.tier === 'CUSTOMER_TYPE' && <span className="subtle"> · your rate</span>}
            {l.capped && <span className="subtle"> · capped</span>}
          </span>
          <span className="nowrap">{money(l.lineHireCents, currency)}</span>
        </div>
      ))}
      <div className="summary-row subtle">
        <span>Hire length</span>
        <span>{plural(q.days, 'day')}</span>
      </div>
      {q.discountCents > 0 && (
        <div className="summary-row">
          <span>Discount</span>
          <span>−{money(q.discountCents, currency)}</span>
        </div>
      )}
      <div className="summary-row">
        <span>Hire subtotal</span>
        <span>{money(q.hireSubtotalCents - q.discountCents, currency)}</span>
      </div>
      {q.bondTotalCents > 0 && (
        <div className="summary-row">
          <span>Refundable bond</span>
          <span>{money(q.bondTotalCents, currency)}</span>
        </div>
      )}
      <div className="summary-row summary-total">
        <span>Total</span>
        <span>{money(q.totalDueCents, currency)}</span>
      </div>
      <p className="subtle" style={{ margin: '0.25rem 0 0' }}>
        Includes {money(q.gstCents, currency)} GST. The bond carries no GST and is refunded after
        the equipment comes back.
      </p>
      {q.errors.length > 0 && (
        <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {q.errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
