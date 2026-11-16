import { useState } from 'react';
import { resendVerification } from '../api/account';
import { ApiError } from '../api/client';
import { ERROR_CODES, MESSAGES } from '../constants';
import { describeAuthError } from './authForm';
import { useAuth } from './authContext';
import { useAsyncAction } from './useAsyncAction';

export interface ResendOutcome {
  kind: 'ok' | 'error';
  text: string;
}

// Asks the server for a new verification email and turns every outcome into a message for the user.
export function useResendVerification() {
  const { state, refresh } = useAuth();
  const action = useAsyncAction();
  const [outcome, setOutcome] = useState<ResendOutcome | null>(null);

  const resend = async () => {
    setOutcome(null);
    const result = await action.run(() => resendVerification());
    if (!result) return;
    if (result.ok) {
      const email = state.status === 'authenticated' ? state.user.email : 'your address';
      setOutcome({ kind: 'ok', text: `We sent a new link to ${email}. Earlier links no longer work.` });
      return;
    }
    if (result.error instanceof ApiError && result.error.code === ERROR_CODES.ALREADY_VERIFIED) {
      await refresh();
      return;
    }
    setOutcome({ kind: 'error', text: describeAuthError(result.error).form ?? MESSAGES.generic });
  };

  return { pending: action.pending, outcome, resend };
}
