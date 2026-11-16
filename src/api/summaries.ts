import { API_PREFIX, HTTP_NOT_FOUND } from '../constants';
import { ApiError, apiFetch } from './client';
import type { components } from './schema';

export type Summary = components['schemas']['Summary'];

const summaryUrl = (materialId: string): string => `${API_PREFIX}/materials/${encodeURIComponent(materialId)}/summary`;

// A material that has not been summarized yet answers 404; that is an ordinary state, not a failure.
export async function getSummary(materialId: string, signal?: AbortSignal): Promise<Summary | null> {
  try {
    return await apiFetch<Summary>(summaryUrl(materialId), signal ? { signal } : {});
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) return null;
    throw error;
  }
}

export const generateSummary = (materialId: string): Promise<Summary> =>
  apiFetch<Summary>(summaryUrl(materialId), { method: 'POST' });
