import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/authContext';
import { APP_NAME } from '../navigation';
import { LegalFooter } from './LegalFooter';

interface Props {
  title: string;
  children: ReactNode;
}

// A public page: it works the same whether or not anybody is signed in.
export function LegalPage({ title, children }: Props) {
  const { state } = useAuth();
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);

  return (
    <main className="legal-page">
      <p className="brand">{APP_NAME}</p>
      <article className="card" aria-labelledby="legal-heading">
        <h1 id="legal-heading">{title}</h1>
        {children}
      </article>
      <p className="legal-back">
        {state.status === 'authenticated' ? <Link to="/">Back to LearnFlow</Link> : <Link to="/login">Back to sign in</Link>}
      </p>
      <LegalFooter />
    </main>
  );
}
