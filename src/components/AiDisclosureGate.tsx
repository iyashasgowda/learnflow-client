import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/authContext';
import { describeAuthError } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { AI_DISCLOSURE_MESSAGES, LEGAL_PATHS, MESSAGES } from '../constants';

interface Props {
  // The AI feature itself: shown only once the user has acknowledged the disclosure.
  children: ReactNode;
}

// Until the account has acknowledged that text goes to a third-party AI provider, shows that notice instead of the AI feature,
// so no request can be made before it has been read.
export function AiDisclosureGate({ children }: Props) {
  const { state, acknowledgeAiDisclosure } = useAuth();
  const action = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'authenticated' || state.user.aiDisclosureAcknowledged) return <>{children}</>;

  const acknowledge = async () => {
    setError(null);
    const result = await action.run(acknowledgeAiDisclosure);
    if (result && !result.ok) setError(describeAuthError(result.error).form ?? MESSAGES.generic);
  };

  return (
    <section className="notice ai-disclosure" aria-labelledby="ai-disclosure-heading">
      <h3 id="ai-disclosure-heading">{AI_DISCLOSURE_MESSAGES.heading}</h3>
      <p>{AI_DISCLOSURE_MESSAGES.body}</p>
      <p>
        <Link to={LEGAL_PATHS.privacy} target="_blank" rel="noopener noreferrer">
          {AI_DISCLOSURE_MESSAGES.more}
        </Link>
        <span className="visually-hidden"> (opens in a new tab)</span>.
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button type="button" className="button" disabled={action.pending} onClick={() => void acknowledge()}>
        {action.pending ? AI_DISCLOSURE_MESSAGES.acknowledging : AI_DISCLOSURE_MESSAGES.acknowledge}
      </button>
    </section>
  );
}
