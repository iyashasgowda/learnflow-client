import { useState, type FormEvent } from 'react';
import { changePassword } from '../api/account';
import { compact, describeAuthError, validateExistingPassword, validateNewPassword, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { PASSWORD_RULES } from '../constants';
import { FormField } from './FormField';

const FIELD_ORDER = ['currentPassword', 'newPassword', 'confirm'] as const;

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const action = useAsyncAction();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDone(false);
    setFormError(null);
    const found = compact({
      currentPassword: validateExistingPassword(current),
      newPassword: validateNewPassword(next),
      confirm: next && confirm !== next ? 'The passwords do not match.' : confirm ? undefined : 'Type the new password again.',
    });
    setErrors(found);
    const first = FIELD_ORDER.find((name) => found[name]);
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const result = await action.run(() => changePassword(current, next));
    if (!result) return;
    if (result.ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      return;
    }
    const described = describeAuthError(result.error, { fields: ['currentPassword', 'newPassword'], passwordField: 'currentPassword' });
    setFormError(described.form ?? null);
    setErrors(described.fields ?? {});
    const failed = FIELD_ORDER.find((name) => described.fields?.[name]);
    if (failed) document.getElementById(failed)?.focus();
  };

  return (
    <section className="card" aria-labelledby="change-password-heading">
      <h2 id="change-password-heading">Change password</h2>
      <form noValidate onSubmit={submit} aria-busy={action.pending}>
        <FormField
          id="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          error={errors.currentPassword}
        />
        <FormField
          id="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_RULES.min} characters.`}
          value={next}
          onChange={setNext}
          error={errors.newPassword}
        />
        <FormField id="confirm" label="Repeat the new password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={errors.confirm} />
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        {done && <p role="status">Password changed. You were signed out on your other devices.</p>}
        <button type="submit" className="button" disabled={action.pending}>
          {action.pending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}
