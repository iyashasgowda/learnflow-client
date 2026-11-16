import { useAuth } from '../auth/authContext';
import { useResendVerification } from '../auth/useResendVerification';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { DeleteAccountPanel } from '../components/DeleteAccountPanel';
import { SettingsPreferences } from '../components/SettingsPreferences';

export function SettingsPage() {
  const { state } = useAuth();
  const resend = useResendVerification();

  if (state.status !== 'authenticated') return null;
  const { user } = state;

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Settings</h1>
        <p>Choose how LearnFlow looks and keeps time, and manage your account.</p>
      </section>

      <SettingsPreferences />

      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <dl className="details">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Email status</dt>
          <dd>
            {user.emailVerified ? (
              'Verified'
            ) : (
              <>
                Not verified{' '}
                <button type="button" className="button button-quiet" onClick={resend.resend} disabled={resend.pending}>
                  {resend.pending ? 'Sending…' : 'Resend verification email'}
                </button>
              </>
            )}
          </dd>
        </dl>
        {resend.outcome && (
          <p role={resend.outcome.kind === 'error' ? 'alert' : 'status'} className={resend.outcome.kind === 'error' ? 'text-danger' : undefined}>
            {resend.outcome.text}
          </p>
        )}
        <h3>Account actions</h3>
        <ul>
          <li>
            <a href="#change-password-heading">Change your password</a>
          </li>
          <li>
            <a href="#delete-heading">Delete your account</a>
          </li>
        </ul>
      </section>
      <ChangePasswordForm />
      <DeleteAccountPanel />
    </>
  );
}
