import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SettingsProvider } from '../settings/SettingsProvider';
import { useAuth } from './authContext';

export function ProtectedRoute() {
  const { state, retry } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="centered-page" role="status" aria-live="polite">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="centered-page">
        <section className="card" role="alert">
          <h1>Cannot check your session</h1>
          <p>{state.message}</p>
          <button type="button" className="button" onClick={retry}>
            Retry
          </button>
        </section>
      </div>
    );
  }

  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return (
    <SettingsProvider userId={state.user.id}>
      <Outlet />
    </SettingsProvider>
  );
}
