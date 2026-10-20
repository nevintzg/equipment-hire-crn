import { Link } from 'react-router-dom';
import { useTitle } from '@equipment-hire/client/ui';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <div className="container container-narrow">
      <div className="card empty">
        <h1>We couldn&rsquo;t find that page</h1>
        <p>It may have moved, or the link may be out of date.</p>
        <Link to="/" className="btn btn-primary">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
