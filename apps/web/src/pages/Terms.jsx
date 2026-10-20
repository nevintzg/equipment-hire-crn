import { useQuery } from '@tanstack/react-query';
import { ErrorBox, Markdown, Spinner, useTitle } from '@equipment-hire/client/ui';
import { date } from '@equipment-hire/client';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';

export default function Terms() {
  const site = useSite();
  useTitle('Terms of hire', site.name);
  const { data, isPending, error } = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/site/terms'),
  });
  if (isPending) return <Spinner />;
  return (
    <div className="container container-narrow">
      <ErrorBox error={error} />
      {data ? (
        <article>
          <h1>{data.title}</h1>
          <p className="subtle">
            Version {data.version} · published {date(data.publishedAt, site.tz)}
          </p>
          <Markdown source={data.bodyMarkdown} />
        </article>
      ) : (
        !error && <p>Our terms of hire have not been published yet. Please contact us.</p>
      )}
    </div>
  );
}
