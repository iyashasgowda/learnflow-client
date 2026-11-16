import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="card" aria-labelledby="page-heading">
      <h1 id="page-heading">Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/" className="button">
        Back to the dashboard
      </Link>
    </section>
  );
}
