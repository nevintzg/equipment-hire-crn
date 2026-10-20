import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  ErrorBox,
  Field,
  Markdown,
  Modal,
  Spinner,
  useToast,
} from '@equipment-hire/client/ui';
import { date } from '@equipment-hire/client';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useOrg } from '../../lib/org.jsx';

function PublishDialog({ latest, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(latest?.title ?? 'Terms of hire');
  const [body, setBody] = useState(latest?.bodyMarkdown ?? '');
  const [preview, setPreview] = useState(false);
  const m = useMutation({
    mutationFn: () =>
      api.post('/admin/settings/terms', { title, bodyMarkdown: body, makeCurrent: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms-versions'] });
      toast('New terms published');
      onClose();
    },
  });
  return (
    <Modal
      title="Publish new terms"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => m.mutate()}
            disabled={!title || !body || m.isPending}
          >
            Publish as version {(latest?.version ?? 0) + 1}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="alert alert-info">
          Published terms are never edited. Existing bookings keep the version their customer
          accepted; new bookings use this one.
        </div>
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {preview ? (
          <div className="card">
            <Markdown source={body} />
          </div>
        ) : (
          <Field label="Body" hint="Markdown">
            <textarea
              className="input mono"
              rows={18}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        )}
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export default function TermsVersions() {
  const org = useOrg();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const q = useQuery({
    queryKey: ['terms-versions'],
    queryFn: () => api.get('/admin/settings/terms'),
  });
  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const versions = [...q.data].reverse();
  return (
    <div className="stack">
      <div className="card spread">
        <span className="muted">{versions.length} version(s)</span>
        {can('terms.manage') && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            Publish new version
          </button>
        )}
      </div>
      <div className="card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Title</th>
              <th>Published</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {versions.map((t) => (
              <tr key={t.id}>
                <td>
                  v{t.version} {t.isCurrent && <Badge tone="success">Current</Badge>}
                </td>
                <td>{t.title}</td>
                <td>{t.publishedAt ? date(t.publishedAt, org.tz) : 'Draft'}</td>
                <td className="right">
                  <button className="btn btn-sm" onClick={() => setViewing(t)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <PublishDialog latest={versions[0]} onClose={() => setOpen(false)} />}
      {viewing && (
        <Modal
          title={`${viewing.title} · v${viewing.version}`}
          wide
          onClose={() => setViewing(null)}
        >
          <Markdown source={viewing.bodyMarkdown} />
        </Modal>
      )}
    </div>
  );
}
