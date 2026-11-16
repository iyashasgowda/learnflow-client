import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type Analytics = components['schemas']['Analytics'];
export type AnalyticsRange = Analytics['range'];
export type ActivityItem = components['schemas']['ActivityListResponse']['items'][number];

export const getAnalytics = (range: AnalyticsRange, signal?: AbortSignal): Promise<Analytics> =>
  apiFetch<Analytics>(`${API_PREFIX}/analytics?range=${encodeURIComponent(range)}`, signal ? { signal } : {});

export const listActivity = (limit: number, signal?: AbortSignal): Promise<{ items: ActivityItem[] }> =>
  apiFetch<{ items: ActivityItem[] }>(`${API_PREFIX}/activity?limit=${limit}`, signal ? { signal } : {});
