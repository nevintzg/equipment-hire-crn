import { Link } from 'react-router-dom';
import { money, PERIOD_LABELS } from '@equipment-hire/client';
import EquipmentVisual from './EquipmentVisual.jsx';
import { useSite } from '../lib/site.jsx';

export default function EquipmentCard({ item }) {
  const { currency, categories } = useSite();
  const category = categories.find((c) => c.id === item.categoryId);
  return (
    <Link to={`/equipment/${item.slug}`} className="eq-card">
      <EquipmentVisual storageKey={item.primaryImage} name={item.name} />
      <div className="eq-card-body">
        {category && <span className="subtle">{category.name}</span>}
        <strong>{item.name}</strong>
        {item.summary && (
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {item.summary}
          </span>
        )}
        {item.pricing && item.pricing.fromCents > 0 ? (
          <span className="price">
            From {money(item.pricing.fromCents, currency)}{' '}
            <span className="subtle">{PERIOD_LABELS[item.pricing.period] ?? ''}</span>
          </span>
        ) : item.pricing ? (
          <span className="price">Free to borrow</span>
        ) : null}
      </div>
    </Link>
  );
}
