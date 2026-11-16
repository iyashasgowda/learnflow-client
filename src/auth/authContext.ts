import { createContext, useContext } from 'react';
import type { User } from '../api/auth';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; sessionExpired: boolean; accountDeleted?: boolean }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

export interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, acceptTerms: true) => Promise<void>;
  logout: () => Promise<void>;
  // Records that the user has read the notice that AI features send their text to a third-party provider.
  acknowledgeAiDisclosure: () => Promise<void>;
  // Permanently deletes the account, then signs out locally.
  deleteAccount: (password: string) => Promise<void>;
  // Re-reads the signed-in user, for example after the email address was verified.
  refresh: () => Promise<void>;
  // Re-checks the session after the server could not be reached.
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
