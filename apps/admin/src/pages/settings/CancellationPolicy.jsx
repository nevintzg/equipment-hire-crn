import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBox, Field, Spinner, useToast } from '@equipment-hire/client/ui';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import MoneyInput from '../../components/MoneyInput.jsx';

function Editor({ initial }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [tiers, setTiers] = useState(() =>
    initial.map(({ minHoursBefore, refundPercent, feeCents, label, isActive }) => ({
      minHoursBefore,
      refundPercent,
      feeCents,
      label,
      isActive,
    })),
  );
  const patch = (i, p) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const save = useMutation({
    mutationFn: () => api.put('/admin/settings/cancellation-tiers', { tiers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cancellation-tiers'] });
      toast('Cancellation policy saved');
    },
  });
  const sorted = [...tiers]
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => b.minHoursBefore - a.minHoursBefore);

  return (
    <div className="card stack">
      <div>
        <h3 style={{ margin: 0 }}>Refund schedule</h3>
        <p className="muted" style={{ margin: '0.25rem 0 0' }}>
          When a customer cancels, the first band they qualify for (by notice given) decides the
          hire-fee refund. The bond is always refunded in full.
        </p>
      </div>
      {sorted.map((t) => (
        <div key={t.i} className="rate-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }}>
          <Field label="Label (shown to customers)">
            <input
              className="input"
              value={t.label}
              onChange={(e) => patch(t.i, { label: e.target.value })}
            />
          </Field>
          <Field label="At least (hours before)">
            <input
              className="input"
              type="number"
              min={0}
              value={t.minHoursBefore}
              onChange={(e) => patch(t.i, { minHoursBefore: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Refund %">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={t.refundPercent}
              onChange={(e) =>
                patch(t.i, { refundPercent: Math.min(100, Number(e.target.value) || 0) })
              }
            />
          </Field>
          <Field label="Admin fee">
            <MoneyInput value={t.feeCents} onChange={(v) => patch(t.i, { feeCents: v })} />
          </Field>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setTiers((ts) => ts.filter((_, j) => j !== t.i))}
            aria-label="Remove band"
          >
            ✕
          </button>
        </div>
      ))}
      <ErrorBox error={save.error} />
      {can('settings.manage') && (
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              setTiers((ts) => [
                ...ts,
                {
                  minHoursBefore: 0,
                  refundPercent: 0,
                  feeCents: 0,
                  label: 'Less notice',
                  isActive: true,
                },
              ])
            }
            disabled={tiers.length >= 10}
          >
            + Add band
          </button>
          <button
            className="btn btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            Save policy
          </button>
        </div>
      )}
    </div>
  );
}

export default function CancellationPolicy() {
  const q = useQuery({
    queryKey: ['cancellation-tiers'],
    queryFn: () => api.get('/admin/settings/cancellation-tiers'),
  });
  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  return <Editor key={q.dataUpdatedAt} initial={q.data} />;
}
