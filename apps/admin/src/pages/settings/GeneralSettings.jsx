import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBox, Field, Spinner, useToast } from '@equipment-hire/client/ui';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import MoneyInput from '../../components/MoneyInput.jsx';

const GROUP_LABELS = {
  branding: 'Branding',
  contact: 'Contact details',
  booking: 'Booking rules',
  payments: 'Payments',
  site: 'Website',
};

/** "booking.lateFeePerDayCents" → "Late fee per day" */
const humanise = (key) =>
  key
    .split('.')
    .slice(1)
    .join(' ')
    .replace(/Cents$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

const LONG = /instructions|openingHours|footerText|subheading|address/i;

function SettingInput({ def, value, onChange, disabled }) {
  const { key, type } = def;
  if (type === 'BOOLEAN') {
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span>{humanise(key)}</span>
      </label>
    );
  }
  let input;
  if (type === 'COLOR') {
    input = (
      <div className="row" style={{ '--gap': '0.5rem' }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ width: 44, height: 36, border: 0, background: 'none' }}
        />
        <input
          className="input"
          style={{ width: 120 }}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    );
  } else if (type === 'NUMBER' && key.endsWith('Cents')) {
    input = <MoneyInput value={value ?? 0} onChange={onChange} disabled={disabled} />;
  } else if (type === 'NUMBER') {
    input = (
      <input
        className="input"
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        disabled={disabled}
      />
    );
  } else if (type === 'JSON') {
    return <JsonSetting def={def} value={value} onChange={onChange} disabled={disabled} />;
  } else if (type === 'FILE') {
    input = (
      <input
        className="input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        placeholder="Uploaded file id"
      />
    );
  } else if (LONG.test(key)) {
    input = (
      <textarea
        className="input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  } else {
    input = (
      <input
        className="input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }
  return <Field label={humanise(key)}>{input}</Field>;
}

function JsonSetting({ def, value, onChange, disabled }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? def.default ?? null, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <Field
      label={humanise(def.key)}
      hint={
        def.key === 'booking.closedDates'
          ? 'A list of dates, e.g. ["2026-12-25", "2026-12-26"]'
          : 'JSON'
      }
      error={bad ? 'That is not valid JSON' : undefined}
    >
      <textarea
        className="input mono"
        rows={4}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
    </Field>
  );
}

export default function GeneralSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') });
  const [changes, setChanges] = useState({});
  const save = useMutation({
    mutationFn: () => api.patch('/admin/settings', { settings: changes }),
    onSuccess: () => {
      setChanges({});
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['site'] });
      toast('Settings saved');
    },
  });
  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const editable = can('settings.manage');
  const dirty = Object.keys(changes).length > 0;

  return (
    <div className="stack">
      {Object.entries(q.data).map(([group, defs]) => (
        <div key={group} className="card stack">
          <h3 style={{ margin: 0 }}>{GROUP_LABELS[group] ?? group}</h3>
          <div className="form-grid">
            {defs
              .filter((d) => d.type !== 'BOOLEAN')
              .map((d) => (
                <div
                  key={d.key}
                  style={
                    d.type === 'JSON' || LONG.test(d.key) ? { gridColumn: '1 / -1' } : undefined
                  }
                >
                  <SettingInput
                    def={d}
                    value={d.key in changes ? changes[d.key] : d.value}
                    disabled={!editable}
                    onChange={(v) => setChanges((c) => ({ ...c, [d.key]: v }))}
                  />
                </div>
              ))}
          </div>
          <div className="stack" style={{ '--gap': '0.5rem' }}>
            {defs
              .filter((d) => d.type === 'BOOLEAN')
              .map((d) => (
                <SettingInput
                  key={d.key}
                  def={d}
                  value={d.key in changes ? changes[d.key] : d.value}
                  disabled={!editable}
                  onChange={(v) => setChanges((c) => ({ ...c, [d.key]: v }))}
                />
              ))}
          </div>
        </div>
      ))}
      <ErrorBox error={save.error} />
      {editable && (
        <div className="save-bar">
          <span className="subtle">
            {dirty ? `${Object.keys(changes).length} unsaved change(s)` : 'All changes saved'}
          </span>
          <div className="row">
            <button className="btn" onClick={() => setChanges({})} disabled={!dirty}>
              Discard
            </button>
            <button
              className="btn btn-primary"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              Save settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
