import { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import { MESSAGES } from '../constants';

type State =
  | { status: 'loading' }
  | { status: 'ok'; aiConfigured: boolean }
  | { status: 'error'; message: string };

export function ConnectionStatus() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((health) => setState({ status: 'ok', aiConfigured: health.ai.configured }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : MESSAGES.network });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  };

  return (
    <section className="card" aria-labelledby="connection-heading">
      <h2 id="connection-heading">Server connection</h2>
      <div role="status" aria-live="polite">
        {state.status === 'loading' && <p>Checking the server…</p>}
        {state.status === 'ok' && (
          <p>
            Connected. AI features are {state.aiConfigured ? 'configured' : 'not configured on the server'}.
          </p>
        )}
        {state.status === 'error' && <p className="text-danger">{state.message}</p>}
      </div>
      {state.status === 'error' && (
        <button type="button" className="button" onClick={retry}>
          Retry
        </button>
      )}
    </section>
  );
}
