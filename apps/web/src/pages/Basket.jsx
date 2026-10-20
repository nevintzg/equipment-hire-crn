import { Link, useNavigate } from 'react-router-dom';
import { Field, useTitle } from '@equipment-hire/client/ui';
import { isoToday } from '@equipment-hire/client';
import { useSite } from '../lib/site.jsx';
import { useBasket } from '../lib/basket.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useHireWindow } from '../lib/useHireWindow.js';
import { describeSlots, timeLabel, timesFor } from '../lib/slots.js';
import EquipmentVisual from '../components/EquipmentVisual.jsx';
import QuoteSummary from '../components/QuoteSummary.jsx';

function TimeSelect({ value, onChange, options, label }) {
  if (options === null) {
    return (
      <Field label={label}>
        <input
          className="input"
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }
  return (
    <Field
      label={label}
      error={options.length === 0 ? 'No handover window on this day' : undefined}
    >
      <select
        className="input"
        value={options.includes(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={!options.length}
      >
        <option value="" disabled>
          Choose a time
        </option>
        {options.map((t) => (
          <option key={t} value={t}>
            {timeLabel(t)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function Basket() {
  const site = useSite();
  const basket = useBasket();
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const { slots, quote, ready, location } = useHireWindow();
  useTitle('Your basket', site.name);

  const today = isoToday(site.tz);
  const pickupTimes = timesFor(slots, basket.startDate, 'PICKUP');
  const returnTimes = timesFor(slots, basket.endDate, 'RETURN');
  const timesOk =
    (pickupTimes === null || pickupTimes.includes(basket.startTime)) &&
    (returnTimes === null || returnTimes.includes(basket.endTime));

  // Changing a date keeps the chosen time if it is still valid on the new
  // day, otherwise snaps to the first handover window that day.
  const keepOrFirst = (options, current) =>
    options === null || options.includes(current) ? current : (options[0] ?? current);
  const changeDates = (startDate, endDate) =>
    basket.setWindow({
      startDate,
      endDate,
      startTime: keepOrFirst(timesFor(slots, startDate, 'PICKUP'), basket.startTime),
      endTime: keepOrFirst(timesFor(slots, endDate, 'RETURN'), basket.endTime),
    });

  if (!basket.items.length) {
    return (
      <div className="container container-narrow">
        <div className="card empty">
          <h1>Your basket is empty</h1>
          <p>Find what you need, then come back here to choose your dates.</p>
          <Link to="/equipment" className="btn btn-primary">
            Browse equipment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Your basket</h1>
      <div className="checkout">
        <div className="stack" style={{ '--gap': '1.5rem' }}>
          <div className="card">
            <h2>When do you need it?</h2>
            <div className="grid-2">
              <Field label="Collect on">
                <input
                  className="input"
                  type="date"
                  min={today}
                  value={basket.startDate}
                  onChange={(e) =>
                    changeDates(
                      e.target.value,
                      basket.endDate && basket.endDate >= e.target.value
                        ? basket.endDate
                        : e.target.value,
                    )
                  }
                />
              </Field>
              <TimeSelect
                label="Collection time"
                value={basket.startTime}
                options={pickupTimes}
                onChange={(v) => basket.setWindow({ startTime: v })}
              />
              <Field label="Return on">
                <input
                  className="input"
                  type="date"
                  min={basket.startDate || today}
                  value={basket.endDate}
                  onChange={(e) => changeDates(basket.startDate, e.target.value)}
                />
              </Field>
              <TimeSelect
                label="Return time"
                value={basket.endTime}
                options={returnTimes}
                onChange={(v) => basket.setWindow({ endTime: v })}
              />
            </div>
            {slots.length > 0 && (
              <div className="subtle" style={{ marginTop: '0.75rem' }}>
                <div>
                  <strong>Collection:</strong> {describeSlots(slots, 'PICKUP')}
                </div>
                <div>
                  <strong>Return:</strong> {describeSlots(slots, 'RETURN')}
                </div>
              </div>
            )}
            {site.locations.length > 1 ? (
              <div style={{ marginTop: '1rem' }}>
                <Field label="Collect from">
                  <select
                    className="input"
                    value={location?.id ?? ''}
                    onChange={(e) => basket.setWindow({ pickupLocationId: e.target.value })}
                  >
                    {site.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.suburb ? `, ${l.suburb}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : location ? (
              <p className="subtle" style={{ margin: '0.75rem 0 0' }}>
                Collect from <strong>{location.name}</strong>
                {location.suburb ? `, ${location.suburb}` : ''}
                {location.accessNotes ? ` — ${location.accessNotes}` : ''}
              </p>
            ) : null}
          </div>

          <div className="card">
            <h2>Items</h2>
            {basket.items.map((i) => (
              <div className="line" key={i.equipmentId}>
                <EquipmentVisual storageKey={i.image} name={i.name} />
                <div>
                  <Link to={`/equipment/${i.slug}`}>
                    <strong>{i.name}</strong>
                  </Link>
                  <div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ paddingLeft: 0 }}
                      onClick={() => basket.remove(i.equipmentId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="qty">
                  <button
                    onClick={() => basket.setQuantity(i.equipmentId, i.quantity - 1)}
                    aria-label="Fewer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={i.quantity}
                    aria-label={`Quantity of ${i.name}`}
                    onChange={(e) =>
                      basket.setQuantity(i.equipmentId, Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                  <button
                    onClick={() => basket.setQuantity(i.equipmentId, i.quantity + 1)}
                    aria-label="More"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <Link to="/equipment" className="btn btn-sm" style={{ marginTop: '0.75rem' }}>
              + Add more equipment
            </Link>
          </div>
        </div>

        <aside className="card stack detail-aside">
          <h2 style={{ margin: 0 }}>Summary</h2>
          {!signedIn ? (
            <>
              <p className="muted">
                Sign in to see your price — some groups receive discounted rates.
              </p>
              <Link to="/login?next=/basket" className="btn btn-primary btn-block">
                Sign in
              </Link>
              <Link to="/register?next=/basket" className="btn btn-block">
                Create an account
              </Link>
            </>
          ) : !ready ? (
            <p className="muted">Choose your collection and return dates to see a price.</p>
          ) : (
            <>
              <QuoteSummary quote={quote} />
              {!timesOk && (
                <div className="alert alert-warning">
                  Choose collection and return times within our handover windows.
                </div>
              )}
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={!quote.data?.bookable || !timesOk}
                onClick={() => navigate('/checkout')}
              >
                Continue to booking
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
