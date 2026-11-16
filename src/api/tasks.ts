import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type Task = components['schemas']['Task'];
export type TaskListResponse = components['schemas']['TaskListResponse'];
export type DashboardSummary = components['schemas']['DashboardSummary'];
export type TaskPriority = Task['priority'];

export type TaskFilter = 'all' | 'active' | 'completed';
export type TaskSort = 'created' | 'due' | 'priority';

export interface TaskListParams {
  status: TaskFilter;
  sort: TaskSort;
  page: number;
  pageSize: number;
}

export interface NewTask {
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: TaskPriority;
}

// The version is the one the edit was based on; a stale one makes the server answer 409.
export interface TaskPatch {
  version: number;
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: TaskPriority;
  completed?: boolean;
}

const json = (method: 'POST' | 'PATCH', payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const listTasks = (params: TaskListParams, signal?: AbortSignal): Promise<TaskListResponse> => {
  const query = new URLSearchParams({ status: params.status, sort: params.sort, page: String(params.page), pageSize: String(params.pageSize) });
  return apiFetch<TaskListResponse>(`${API_PREFIX}/tasks?${query.toString()}`, signal ? { signal } : {});
};

export const createTask = (task: NewTask): Promise<Task> => apiFetch<Task>(`${API_PREFIX}/tasks`, json('POST', task));

export const updateTask = (id: string, patch: TaskPatch): Promise<Task> =>
  apiFetch<Task>(`${API_PREFIX}/tasks/${encodeURIComponent(id)}`, json('PATCH', patch));

export const deleteTask = (id: string): Promise<void> => apiFetch<void>(`${API_PREFIX}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getDashboardSummary = (signal?: AbortSignal): Promise<DashboardSummary> =>
  apiFetch<DashboardSummary>(`${API_PREFIX}/dashboard/summary`, signal ? { signal } : {});
