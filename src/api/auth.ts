import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type User = components['schemas']['User'];
type AuthResponse = components['schemas']['AuthResponse'];
type RegisterRequest = components['schemas']['RegisterRequest'];
type LoginRequest = components['schemas']['LoginRequest'];

const jsonPost = (payload: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  ...(signal ? { signal } : {}),
});

export async function getCurrentUser(signal?: AbortSignal): Promise<User> {
  const response = await apiFetch<AuthResponse>(`${API_PREFIX}/auth/me`, signal ? { signal } : {});
  return response.user;
}

export async function register(payload: RegisterRequest): Promise<User> {
  return (await apiFetch<AuthResponse>(`${API_PREFIX}/auth/register`, jsonPost(payload))).user;
}

export async function login(payload: LoginRequest): Promise<User> {
  return (await apiFetch<AuthResponse>(`${API_PREFIX}/auth/login`, jsonPost(payload))).user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>(`${API_PREFIX}/auth/logout`, { method: 'POST' });
}
