import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../api/account';
import { describeAuthError } from '../auth/authForm';
import { useAuth } from '../auth/authContext';
import { useResendVerification } from '../auth/useResendVerification';
import { AuthCard } from '../components/AuthCard';
import { MESSAGES } from '../constants';

type Status = 'verifying' | 'verified' | 'failed';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, refresh } = useAuth();
  const [token] = useState(() => params.get('token')?.trim() ?? '');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState(token ? '' : 'This link is incomplete.');
  const resend = useResendVerification();
  // Guards against running twice (React strict mode); a second attempt would find the token already used.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Keep the token out of the address bar and the browser history.
    navigate(location.pathname, { replace: true });
    if (!token) return;
    verifyEmail(token)
      .then(() => {
        setStatus('verified');
        void refresh();
      })
      .catch((err: unknown) => {
        setStatus('failed');
        setMessage(describeAuthError(err).form ?? MESSAGES.generic);
      });
  }, [navigate, location.pathname, token, refresh]);

  const signedIn = state.status === 'authenticated';

  return (
    <AuthCard
      title="Verify your email"
      footer={
        <>
          <Link to="/">Go to LearnFlow</Link>
        </>
      }
    >
      {status === 'verifying' && <p role="status">Verifying your email…</p>}

      {status === 'verified' && (
        <p role="status">Your email address is verified. You can now use AI features.</p>
      )}

      {status === 'failed' && (
        <>
          <p role="alert" className="form-error">
            {message}
          </p>
          {signedIn ? (
            <>
              <button type="button" className="button button-block" onClick={resend.resend} disabled={resend.pending}>
                {resend.pending ? 'Sending…' : 'Send me a new link'}
              </button>
              {resend.outcome && (
                <p role={resend.outcome.kind === 'error' ? 'alert' : 'status'} className={resend.outcome.kind === 'error' ? 'text-danger' : undefined}>
                  {resend.outcome.text}
                </p>
              )}
            </>
          ) : (
            <p>
              <Link to="/login">Sign in</Link> to ask for a new link.
            </p>
          )}
        </>
      )}
    </AuthCard>
  );
}
