import { Link, Navigate, useLocation } from 'react-router-dom';
import { destinationFrom, validateExistingPassword } from '../auth/authForm';
import { useAuth } from '../auth/authContext';
import { useAuthForm } from '../auth/useAuthForm';
import { AuthCard } from '../components/AuthCard';
import { FormField } from '../components/FormField';
import { MESSAGES } from '../constants';

export function LoginPage() {
  const { state, login } = useAuth();
  const location = useLocation();
  const form = useAuthForm({ validatePassword: validateExistingPassword, action: login });

  if (state.status === 'authenticated') {
    return <Navigate to={destinationFrom(location.state)} replace />;
  }

  const expired = state.status === 'anonymous' && state.sessionExpired;
  const deleted = state.status === 'anonymous' && state.accountDeleted === true;
  const passwordChanged = (location.state as { notice?: string } | null)?.notice === 'passwordChanged';

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to LearnFlow? <Link to="/register">Create an account</Link>
        </>
      }
    >
      {expired && (
        <p role="status" className="notice">
          {MESSAGES.sessionExpired}
        </p>
      )}
      {deleted && (
        <p role="status" className="notice">
          Your account was deleted. All of its data has been removed.
        </p>
      )}
      {passwordChanged && (
        <p role="status" className="notice">
          Your password was changed. Sign in with the new one.
        </p>
      )}
      <form noValidate onSubmit={form.submit} aria-busy={form.pending}>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={form.setEmail}
          error={form.errors.email}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={form.setPassword}
          error={form.errors.password}
        />
        <p className="field-hint">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        {form.formError && (
          <p role="alert" className="form-error">
            {form.formError}
          </p>
        )}
        <button type="submit" className="button button-block" disabled={form.pending}>
          {form.pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  );
}
