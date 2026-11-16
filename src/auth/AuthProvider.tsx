import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { acknowledgeAiDisclosure as apiAcknowledgeAiDisclosure, deleteAccount as apiDeleteAccount } from '../api/account';
import { getCurrentUser, login as apiLogin, logout as apiLogout, register as apiRegister } from '../api/auth';
import { ApiError, setUnauthorizedHandler } from '../api/client';
import { MESSAGES } from '../constants';
import { AuthContext, type AuthContextValue, type AuthState } from './authContext';

const UNAUTHORIZED_STATUS = 401;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const queryClient = useQueryClient();

  // Cached data belongs to one user, so it is dropped as soon as nobody is signed in.
  useEffect(() => {
    if (state.status === 'anonymous') queryClient.clear();
  }, [state.status, queryClient]);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser(controller.signal)
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === UNAUTHORIZED_STATUS) {
          setState({ status: 'anonymous', sessionExpired: false });
        } else {
          setState({ status: 'error', message: err instanceof Error ? err.message : MESSAGES.generic });
        }
      });
    return () => controller.abort();
  }, [attempt]);

  // Any later request that reports a dead session signs the user out locally.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState((current) => (current.status === 'authenticated' ? { status: 'anonymous', sessionExpired: true } : current));
    });
    return () => setUnauthorizedHandler(undefined);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await apiLogin({ email, password });
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (email: string, password: string, acceptTerms: true) => {
    const user = await apiRegister({ email, password, acceptTerms });
    setState({ status: 'authenticated', user });
  }, []);

  const acknowledgeAiDisclosure = useCallback(async () => {
    await apiAcknowledgeAiDisclosure();
    setState((current) => (current.status === 'authenticated' ? { status: 'authenticated', user: { ...current.user, aiDisclosureAcknowledged: true } } : current));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: 'anonymous', sessionExpired: false });
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await apiDeleteAccount(password);
    setState({ status: 'anonymous', sessionExpired: false, accountDeleted: true });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      setState((current) => (current.status === 'authenticated' ? { status: 'authenticated', user } : current));
    } catch {
      // Keep what we have; a dead session is handled by the session-expiry hook.
    }
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, acknowledgeAiDisclosure, deleteAccount, refresh, retry }),
    [state, login, register, logout, acknowledgeAiDisclosure, deleteAccount, refresh, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
