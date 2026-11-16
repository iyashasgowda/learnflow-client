import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { MESSAGES } from '../constants';

export function UserMenu() {
  const { state, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'authenticated') return null;

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (err) {
      // Still signed in on the server, so stay signed in here and say why.
      setError(err instanceof Error ? err.message : MESSAGES.generic);
      setPending(false);
    }
  };

  return (
    <div className="user-menu">
      <span className="user-email" title={state.user.email}>
        {state.user.email}
      </span>
      <button type="button" className="button button-quiet" onClick={signOut} disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error && (
        <span role="alert" className="text-danger">
          Could not sign out. {error}
        </span>
      )}
    </div>
  );
}
