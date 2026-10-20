import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, ErrorBox, Field, Spinner, useToast } from '@equipment-hire/client/ui';
import { api } from '../../lib/api.js';

function TemplateEditor({ template }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    subject: template.subject,
    bodyMarkdown: template.bodyMarkdown,
    isActive: template.isActive,
  });
  const m = useMutation({
    mutationFn: () => api.put(`/admin/settings/email-templates/${template.code}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast('Template saved');
    },
  });
  return (
    <div className="card stack">
      <div className="spread">
        <h3 style={{ margin: 0 }} className="mono">
          {template.code}
        </h3>
        <label className="check">
          <input
            type="checkbox"
            checked={v.isActive}
            onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          />
          <span>Send this email</span>
        </label>
      </div>
      <Field label="Subject">
        <input
          className="input"
          value={v.subject}
          onChange={(e) => setV({ ...v, subject: e.target.value })}
        />
      </Field>
      <Field
        label="Body"
        hint="Markdown with {{variables}} — e.g. {{customer.firstName}}, {{booking.reference}}, {{booking.url}}"
      >
        <textarea
          className="input mono"
          rows={14}
          value={v.bodyMarkdown}
          onChange={(e) => setV({ ...v, bodyMarkdown: e.target.value })}
        />
      </Field>
      <ErrorBox error={m.error} />
      <div>
        <button className="btn btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>
          Save template
        </button>
      </div>
    </div>
  );
}

export default function EmailTemplates() {
  const q = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get('/admin/settings/email-templates'),
  });
  const [code, setCode] = useState(null);
  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const selected = q.data.find((t) => t.code === code) ?? q.data[0];
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)' }}>
      <div className="card card-flush">
        {q.data.map((t) => (
          <button
            key={t.code}
            className="btn btn-ghost btn-block"
            style={{
              justifyContent: 'space-between',
              borderRadius: 0,
              background: t.code === selected?.code ? 'var(--surface-2)' : undefined,
            }}
            onClick={() => setCode(t.code)}
          >
            <span className="mono" style={{ fontSize: '0.82rem' }}>
              {t.code}
            </span>
            {!t.isActive && <Badge>off</Badge>}
          </button>
        ))}
      </div>
      {selected && <TemplateEditor key={selected.code + selected.updatedAt} template={selected} />}
    </div>
  );
}
