import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type Settings = components['schemas']['Settings'];
export type SettingsChanges = Partial<Pick<Settings, 'theme' | 'timeZone' | 'weekStart'>>;

export const getSettings = (signal?: AbortSignal): Promise<Settings> => apiFetch<Settings>(`${API_PREFIX}/settings`, signal ? { signal } : {});

export const updateSettings = (changes: SettingsChanges): Promise<Settings> =>
  apiFetch<Settings>(`${API_PREFIX}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
