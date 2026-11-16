import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type StudySession = components['schemas']['StudySession'];
export type NewStudySession = components['schemas']['CreateSessionRequest'];
export type StudySessionPatch = components['schemas']['UpdateSessionRequest'];

const json = (method: 'POST' | 'PATCH', payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const base = `${API_PREFIX}/sessions`;
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

// Sessions overlapping [from, to), earliest first. Both are ISO instants.
export function listSessions(from: string, to: string, limit?: number, signal?: AbortSignal): Promise<{ items: StudySession[] }> {
  const query = new URLSearchParams({ from, to, ...(limit === undefined ? {} : { limit: String(limit) }) });
  return apiFetch<{ items: StudySession[] }>(`${base}?${query.toString()}`, signal ? { signal } : {});
}

export const createSession = (session: NewStudySession): Promise<StudySession> => apiFetch<StudySession>(base, json('POST', session));

export const updateSession = (id: string, patch: StudySessionPatch): Promise<StudySession> => apiFetch<StudySession>(one(id), json('PATCH', patch));

export const deleteSession = (id: string): Promise<void> => apiFetch<void>(one(id), { method: 'DELETE' });
