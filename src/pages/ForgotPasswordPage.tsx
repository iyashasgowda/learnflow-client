import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/account';
import { compact, describeAuthError, validateEmail, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { AuthCard } from '../components/AuthCard';
import { FormField } from '../components/FormField';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const action = useAsyncAction();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = compact({ email: validateEmail(email) });
    setErrors(found);
    setFormError(null);
    if (found.email) {
      document.getElementById('email')?.focus();
      return;
    }
    const result = await action.run(() => forgotPassword(email.trim()));
    if (!result) return;
    if (result.ok) {
      setSentTo(email.trim());
    } else {
      const described = describeAuthError(result.error, { fields: ['email'] });
      setFormError(described.form ?? null);
      setErrors(described.fields ?? {});
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      footer={
        <>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </>
      }
    >
      {sentTo ? (
        <p role="status">
          If an account exists for <strong>{sentTo}</strong>, we have sent a link to reset the password. It works once and expires in an hour. Check your spam folder if
          it does not arrive.
        </p>
      ) : (
        <form noValidate onSubmit={submit} aria-busy={action.pending}>
          <p>Enter the email address of your account and we will send you a link to choose a new password.</p>
          <FormField id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <button type="submit" className="button button-block" disabled={action.pending}>
            {action.pending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
