import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, ErrorBox, Pagination, Spinner, useTitle } from '@equipment-hire/client/ui';
import { dateTime } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useOrg } from '../lib/org.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Enquiries() {
  useTitle('Enquiries', 'Admin');
  const org = useOrg();
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['enquiries', status, page],
    queryFn: () => api.list('/admin/enquiries', { status, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const m = useMutation({
    mutationFn: ({ id, handled }) => api.patch(`/admin/enquiries/${id}`, { handled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Messages from the website contact form" />
      <div className="tabs">
        {[
          ['OPEN', 'Open'],
          ['HANDLED', 'Handled'],
          ['', 'All'],
        ].map(([v, l]) => (
          <button
            key={v}
            className={status === v ? 'active' : ''}
            onClick={() => {
              setStatus(v);
              setPage(1);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorBox error={m.error} />
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : q.data.data.length === 0 ? (
        <div className="card empty">Nothing here.</div>
      ) : (
        <div className="stack">
          {q.data.data.map((e) => (
            <div key={e.id} className="card stack" style={{ '--gap': '0.5rem' }}>
              <div className="spread">
                <div>
                  <strong>{e.subject || 'Website enquiry'}</strong>
                  <div className="subtle">
                    {e.name} ·{' '}
                    <a
                      href={`mailto:${e.email}?subject=${encodeURIComponent(`Re: ${e.subject || 'Your enquiry'}`)}`}
                    >
                      {e.email}
                    </a>
                    {e.phone && ` · ${e.phone}`} · {dateTime(e.createdAt, org.tz)}
                  </div>
                </div>
                <div className="row">
                  {e.handledAt ? (
                    <Badge tone="success">Handled</Badge>
                  ) : (
                    <Badge tone="warning">Open</Badge>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => m.mutate({ id: e.id, handled: !e.handledAt })}
                    disabled={m.isPending}
                  >
                    {e.handledAt ? 'Reopen' : 'Mark handled'}
                  </button>
                </div>
              </div>
              <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{e.message}</p>
            </div>
          ))}
          <Pagination meta={q.data.meta} onPage={setPage} />
        </div>
      )}
    </>
  );
}
