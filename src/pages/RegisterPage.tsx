import { Link, Navigate } from 'react-router-dom';
import { LEGAL_PATHS, PASSWORD_RULES } from '../constants';
import { validateNewPassword } from '../auth/authForm';
import { useAuth } from '../auth/authContext';
import { useAuthForm } from '../auth/useAuthForm';
import { AuthCard } from '../components/AuthCard';
import { FormField } from '../components/FormField';

export function RegisterPage() {
  const { state, register } = useAuth();
  // The form only runs the action after the Terms and Privacy Policy were accepted.
  const form = useAuthForm({ validatePassword: validateNewPassword, action: (email, password) => register(email, password, true), requireConsent: true });

  if (state.status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
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
          autoComplete="new-password"
          hint={`At least ${PASSWORD_RULES.min} characters.`}
          value={form.password}
          onChange={form.setPassword}
          error={form.errors.password}
        />
        <div className="form-field consent">
          <label htmlFor="acceptTerms">
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              checked={form.accepted}
              aria-invalid={form.errors.acceptTerms ? true : undefined}
              aria-describedby={form.errors.acceptTerms ? 'acceptTerms-error' : undefined}
              onChange={(event) => form.setAccepted(event.target.checked)}
            />{' '}
            I accept the{' '}
            <Link to={LEGAL_PATHS.terms} target="_blank" rel="noopener noreferrer">
              Terms of Service
            </Link>{' '}
            and the{' '}
            <Link to={LEGAL_PATHS.privacy} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            <span className="visually-hidden"> (both open in a new tab)</span>
          </label>
          {form.errors.acceptTerms && (
            <p id="acceptTerms-error" className="field-error">
              {form.errors.acceptTerms}
            </p>
          )}
        </div>
        {form.formError && (
          <p role="alert" className="form-error">
            {form.formError}
          </p>
        )}
        <button type="submit" className="button button-block" disabled={form.pending}>
          {form.pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}
