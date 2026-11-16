import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/account';
import { compact, describeAuthError, validateNewPassword, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { AuthCard } from '../components/AuthCard';
import { FormField } from '../components/FormField';
import { PASSWORD_RULES } from '../constants';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [token] = useState(() => params.get('token')?.trim() ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const action = useAsyncAction();
  const stripped = useRef(false);

  useEffect(() => {
    if (stripped.current) return;
    stripped.current = true;
    // Keep the token out of the address bar and the browser history.
    navigate(location.pathname, { replace: true });
  }, [navigate, location.pathname]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = compact({
      password: validateNewPassword(password),
      confirm: password && confirm !== password ? 'The passwords do not match.' : confirm ? undefined : 'Type the new password again.',
    });
    setErrors(found);
    setFormError(null);
    const first = (['password', 'confirm'] as const).find((name) => found[name]);
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const result = await action.run(() => resetPassword(token, password));
    if (!result) return;
    if (result.ok) {
      navigate('/login', { replace: true, state: { notice: 'passwordChanged' } });
    } else {
      const described = describeAuthError(result.error, { fields: ['password'] });
      setFormError(described.form ?? null);
      setErrors(described.fields ?? {});
    }
  };

  if (!token) {
    return (
      <AuthCard title="Choose a new password" footer={<Link to="/login">Back to sign in</Link>}>
        <p role="alert" className="form-error">
          This link is incomplete. Open the link from the email again, or request a new one.
        </p>
        <Link to="/forgot-password" className="button button-block">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" footer={<Link to="/login">Back to sign in</Link>}>
      <form noValidate onSubmit={submit} aria-busy={action.pending}>
        <FormField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_RULES.min} characters. You will be signed out everywhere.`}
          value={password}
          onChange={setPassword}
          error={errors.password}
        />
        <FormField id="confirm" label="Repeat the new password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={errors.confirm} />
        {formError && (
          <p role="alert" className="form-error">
            {formError} <Link to="/forgot-password">Request a new link</Link>
          </p>
        )}
        <button type="submit" className="button button-block" disabled={action.pending}>
          {action.pending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </AuthCard>
  );
}
