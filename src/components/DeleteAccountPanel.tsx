import { useEffect, useState, type FormEvent } from 'react';
import { compact, describeAuthError, validateExistingPassword, type FieldErrors } from '../auth/authForm';
import { useAuth } from '../auth/authContext';
import { useAsyncAction } from '../auth/useAsyncAction';
import { FormField } from './FormField';

const PASSWORD_ID = 'delete-password';

export function DeleteAccountPanel() {
  const { deleteAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const action = useAsyncAction();

  useEffect(() => {
    if (confirming) document.getElementById(PASSWORD_ID)?.focus();
  }, [confirming]);

  const cancel = () => {
    setConfirming(false);
    setPassword('');
    setErrors({});
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const found = compact({ password: validateExistingPassword(password) });
    setErrors(found);
    if (found.password) {
      document.getElementById(PASSWORD_ID)?.focus();
      return;
    }
    const result = await action.run(() => deleteAccount(password));
    if (!result || result.ok) return;
    const described = describeAuthError(result.error, { fields: ['password'] });
    setFormError(described.form ?? null);
    setErrors(described.fields ?? {});
    document.getElementById(PASSWORD_ID)?.focus();
  };

  return (
    <section className="card danger-zone" aria-labelledby="delete-heading">
      <h2 id="delete-heading">Delete account</h2>
      <p>Permanently delete your account and everything in it, including your tasks, materials, conversations, and quizzes. This cannot be undone.</p>
      {!confirming ? (
        <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>
          Delete my account…
        </button>
      ) : (
        <form noValidate onSubmit={submit} aria-busy={action.pending} aria-label="Confirm account deletion">
          <p>
            <strong>Are you sure?</strong> Enter your password to permanently delete your account.
          </p>
          <FormField
            id={PASSWORD_ID}
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="button button-danger" disabled={action.pending}>
              {action.pending ? 'Deleting…' : 'Permanently delete my account'}
            </button>
            <button type="button" className="button button-quiet" onClick={cancel} disabled={action.pending}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
