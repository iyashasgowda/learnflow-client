import { useAuth } from '../auth/authContext';
import { useResendVerification } from '../auth/useResendVerification';

export function VerifyEmailBanner() {
  const { state } = useAuth();
  const { pending, outcome, resend } = useResendVerification();

  if (state.status !== 'authenticated' || state.user.emailVerified) return null;

  return (
    <section className="banner" aria-label="Email verification">
      <p>
        <strong>Verify your email to use AI features.</strong> We sent a link to {state.user.email}. Check your spam folder if you cannot find it.
      </p>
      <button type="button" className="button button-quiet" onClick={resend} disabled={pending}>
        {pending ? 'Sending…' : 'Resend email'}
      </button>
      {outcome && (
        <p role={outcome.kind === 'error' ? 'alert' : 'status'} className={outcome.kind === 'error' ? 'text-danger' : undefined}>
          {outcome.text}
        </p>
      )}
    </section>
  );
}
