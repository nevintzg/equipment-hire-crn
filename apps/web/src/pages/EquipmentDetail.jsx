import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, ErrorBox, Markdown, Spinner, useTitle, useToast } from '@equipment-hire/client/ui';
import { money, PERIOD_LABELS, plural } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';
import { useBasket } from '../lib/basket.jsx';
import EquipmentVisual from '../components/EquipmentVisual.jsx';
import EquipmentCard from '../components/EquipmentCard.jsx';
import AvailabilityCalendar from '../components/AvailabilityCalendar.jsx';

function attributeValue(a) {
  if (a.type === 'BOOLEAN') return a.valueBool ? 'Yes' : 'No';
  if (a.type === 'NUMBER') return `${a.valueNumber ?? '—'}${a.unitLabel ? ` ${a.unitLabel}` : ''}`;
  if (a.type === 'MULTI_SELECT') return (a.valueOptions ?? []).join(', ');
  return a.valueText ?? (a.valueOptions ?? []).join(', ');
}

function rateLabel(r, unit) {
  const period = PERIOD_LABELS[r.period] ?? '';
  const from = r.fromUnit > 1 ? ` from ${unit === 'HOUR' ? 'hour' : 'day'} ${r.fromUnit}` : '';
  const cap = r.maxChargeCents ? ` (max ${money(r.maxChargeCents)})` : '';
  return `${period}${from}${cap}`;
}

export default function EquipmentDetail() {
  const { slug } = useParams();
  const site = useSite();
  const basket = useBasket();
  const toast = useToast();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [imageIdx, setImageIdx] = useState(0);

  const {
    data: item,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['equipment', 'detail', slug],
    queryFn: () => api.get(`/equipment/${slug}`),
  });
  useTitle(item?.name, site.name);

  if (isPending) return <Spinner />;
  if (error)
    return (
      <div className="container container-narrow">
        <ErrorBox error={error} onRetry={error.status === 404 ? undefined : refetch} />
        <p style={{ marginTop: '1rem' }}>
          <Link to="/equipment">← Back to all equipment</Link>
        </p>
      </div>
    );

  const images = item.media.filter((m) => m.kind === 'IMAGE');
  const capacity = item.capacity ?? 1;
  const maxQty = Math.max(1, Math.min(capacity, item.maxPerBooking ?? capacity));
  const inBasket = basket.items.find((i) => i.equipmentId === item.id)?.quantity ?? 0;
  const baseRate = item.pricing?.rates?.[0];

  const addToBasket = () => {
    basket.add(
      {
        equipmentId: item.id,
        slug: item.slug,
        name: item.name,
        categoryId: item.categoryId,
        image: images[0]?.storageKey ?? null,
      },
      qty,
    );
    toast(`${item.name} added to your basket`);
  };

  const requirements = [
    item.requiresLicence && 'Driver licence required',
    item.requiresTowing && 'Tow vehicle required',
    item.requiresInduction && 'Induction required',
    item.alwaysRequiresReview && 'Every booking is reviewed by staff',
  ].filter(Boolean);

  return (
    <div className="container">
      <nav className="subtle" style={{ marginBottom: '1rem' }}>
        <Link to="/equipment">Equipment</Link>
        {item.category && (
          <>
            {' / '}
            <Link to={`/equipment?category=${item.category.slug}`}>{item.category.name}</Link>
          </>
        )}
      </nav>

      <div className="detail">
        <div className="stack" style={{ '--gap': '1.5rem' }}>
          <div>
            <div className="gallery-main">
              <EquipmentVisual
                storageKey={images[imageIdx]?.storageKey}
                name={item.name}
                alt={images[imageIdx]?.altText}
              />
            </div>
            {images.length > 1 && (
              <div className="thumbs">
                {images.map((img, i) => (
                  <button
                    key={i}
                    className={i === imageIdx ? 'active' : ''}
                    onClick={() => setImageIdx(i)}
                    aria-label={`Image ${i + 1}`}
                  >
                    <EquipmentVisual
                      storageKey={img.storageKey}
                      name={item.name}
                      alt={img.altText}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1>{item.name}</h1>
            {item.summary && (
              <p className="muted" style={{ fontSize: '1.08rem' }}>
                {item.summary}
              </p>
            )}
            {requirements.length > 0 && (
              <div className="requirements" style={{ marginBottom: '1rem' }}>
                {requirements.map((r) => (
                  <Badge key={r} tone="warning">
                    {r}
                  </Badge>
                ))}
              </div>
            )}
            {item.description && <Markdown source={item.description} />}
          </div>

          {(item.attributes.length > 0 || item.dimensions || item.weightKg) && (
            <div className="card">
              <h3>Specifications</h3>
              <dl className="kv">
                {item.attributes.map((a) => (
                  <div key={a.code} style={{ display: 'contents' }}>
                    <dt>{a.label}</dt>
                    <dd>{attributeValue(a)}</dd>
                  </div>
                ))}
                {item.dimensions && (
                  <>
                    <dt>Dimensions</dt>
                    <dd>{item.dimensions}</dd>
                  </>
                )}
                {item.weightKg ? (
                  <>
                    <dt>Weight</dt>
                    <dd>{item.weightKg} kg</dd>
                  </>
                ) : null}
              </dl>
            </div>
          )}

          {item.includedItems && (
            <div className="card">
              <h3>What&rsquo;s included</h3>
              <Markdown source={item.includedItems} />
            </div>
          )}
          {item.safetyNotes && (
            <div className="card">
              <h3>Safety</h3>
              <Markdown source={item.safetyNotes} />
            </div>
          )}
          {item.pickupInstructions && (
            <div className="card">
              <h3>Collection and return</h3>
              <Markdown source={item.pickupInstructions} />
            </div>
          )}
        </div>

        <aside className="detail-aside stack">
          <div className="card stack">
            {item.pricing ? (
              <div>
                {baseRate ? (
                  <>
                    <div className="price-big">
                      {money(baseRate.amountCents, site.currency)}{' '}
                      <span className="subtle" style={{ fontSize: '0.95rem', fontWeight: 400 }}>
                        {PERIOD_LABELS[baseRate.period]}
                      </span>
                    </div>
                    {item.pricing.rates.length > 1 && (
                      <ul
                        className="subtle"
                        style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}
                      >
                        {item.pricing.rates.slice(1).map((r, i) => (
                          <li key={i}>
                            {money(r.amountCents, site.currency)} {rateLabel(r, item.bookingUnit)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.pricing.tier === 'CUSTOMER_TYPE' && (
                      <div style={{ marginTop: 6 }}>
                        <Badge tone="success">Your discounted rate</Badge>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="price-big">Free to borrow</div>
                )}
                {item.pricing.bondCents > 0 && (
                  <p className="subtle" style={{ margin: '0.5rem 0 0' }}>
                    Plus a refundable bond of {money(item.pricing.bondCents, site.currency)} per
                    item
                  </p>
                )}
              </div>
            ) : (
              <p className="muted">Contact us for pricing.</p>
            )}

            <dl className="kv" style={{ fontSize: '0.9rem' }}>
              <dt>Minimum hire</dt>
              <dd>{plural(item.minHireUnits, item.bookingUnit === 'HOUR' ? 'hour' : 'day')}</dd>
              {item.minNoticeDays > 0 && (
                <>
                  <dt>Notice needed</dt>
                  <dd>{plural(item.minNoticeDays, 'day')}</dd>
                </>
              )}
              {capacity > 1 && (
                <>
                  <dt>We have</dt>
                  <dd>{capacity}</dd>
                </>
              )}
            </dl>

            <div className="row">
              {maxQty > 1 && (
                <div className="qty">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxQty}
                    value={qty}
                    aria-label="Quantity"
                    onChange={(e) =>
                      setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))
                    }
                  />
                  <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="More">
                    +
                  </button>
                </div>
              )}
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={addToBasket}>
                Add to basket
              </button>
            </div>
            {inBasket > 0 && (
              <div className="alert alert-success spread">
                <span>{inBasket} in your basket</span>
                <button className="btn btn-sm" onClick={() => navigate('/basket')}>
                  View basket
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Availability</h3>
            <p className="subtle">Pick a start and end date to add them to your basket.</p>
            <AvailabilityCalendar
              slug={item.slug}
              tz={site.tz}
              quantity={qty}
              start={basket.startDate}
              end={basket.endDate}
              onSelect={({ start, end }) => basket.setWindow({ startDate: start, endDate: end })}
            />
          </div>
        </aside>
      </div>

      {item.related.length > 0 && (
        <section className="section" style={{ marginTop: '3rem' }}>
          <h2>You might also need</h2>
          <div className="grid" style={{ '--min': '220px' }}>
            {item.related.map((r) => (
              <EquipmentCard key={r.id} item={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
