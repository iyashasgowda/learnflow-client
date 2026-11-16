import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

type StatusResponse = components['schemas']['StatusResponse'];

const post = (payload?: unknown): RequestInit => ({
  method: 'POST',
  ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
});

export const verifyEmail = (token: string): Promise<StatusResponse> =>
  apiFetch<StatusResponse>(`${API_PREFIX}/auth/verify`, post({ token }));

export const resendVerification = (): Promise<StatusResponse> => apiFetch<StatusResponse>(`${API_PREFIX}/auth/verify/resend`, post());

export const acknowledgeAiDisclosure = (): Promise<void> => apiFetch<void>(`${API_PREFIX}/account/ai-disclosure`, post());

export const forgotPassword = (email: string): Promise<StatusResponse> =>
  apiFetch<StatusResponse>(`${API_PREFIX}/auth/forgot`, post({ email }));

export const resetPassword = (token: string, password: string): Promise<void> =>
  apiFetch<void>(`${API_PREFIX}/auth/reset`, post({ token, password }));

export const changePassword = (currentPassword: string, newPassword: string): Promise<void> =>
  apiFetch<void>(`${API_PREFIX}/auth/password`, post({ currentPassword, newPassword }));

export const deleteAccount = (password: string): Promise<void> =>
  apiFetch<void>(`${API_PREFIX}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
