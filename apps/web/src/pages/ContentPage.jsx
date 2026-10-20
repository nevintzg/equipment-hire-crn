import { useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorBox, Markdown, Spinner, useTitle } from '@equipment-hire/client/ui';
import { api } from '../lib/api.js';
import { useSite } from '../lib/site.jsx';
import NotFound from './NotFound.jsx';

/**
 * A CMS page. Staff link pages at the root ("/about") as well as under
 * /pages/, so this also serves as the catch-all route: a single-segment path
 * is looked up as a page slug before giving up with "not found".
 */
export default function ContentPage() {
  const params = useParams();
  const { pathname } = useLocation();
  const slug = params.slug ?? pathname.replace(/^\/|\/$/g, '');
  const site = useSite();
  const lookup = /^[a-z0-9-]+$/.test(slug);
  const { data, isPending, error } = useQuery({
    queryKey: ['page', slug],
    queryFn: () => api.get(`/site/pages/${slug}`),
    enabled: lookup,
  });
  useTitle(data?.metaTitle || data?.title, site.name);

  if (!lookup || error?.status === 404) return <NotFound />;
  if (isPending) return <Spinner />;
  return (
    <div className="container container-narrow">
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <article>
          <h1>{data.title}</h1>
          <Markdown source={data.bodyMarkdown} />
        </article>
      )}
    </div>
  );
}
