import { API_PREFIX, CSRF_HEADER, CSRF_HEADER_VALUE, MATERIAL_UPLOAD_FIELD, MESSAGES } from '../constants';
import { apiFetch, errorFromResponse, NetworkError } from './client';
import type { components } from './schema';

export type Material = components['schemas']['Material'];
export type MaterialList = components['schemas']['MaterialListResponse'];

export const listMaterials = (signal?: AbortSignal): Promise<MaterialList> =>
  apiFetch<MaterialList>(`${API_PREFIX}/materials`, signal ? { signal } : {});

export const deleteMaterial = (id: string): Promise<void> => apiFetch<void>(`${API_PREFIX}/materials/${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface UploadHandlers {
  // Fraction of the file sent so far, from 0 to 1.
  onProgress?: (fraction: number) => void;
  // The whole file has been sent; the server is now reading it.
  onSent?: () => void;
  signal?: AbortSignal;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// fetch cannot report upload progress, so uploads use XMLHttpRequest with the same headers and error handling.
export function uploadMaterial(file: File, { onProgress, onSent, signal }: UploadHandlers = {}): Promise<Material> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_PREFIX}/materials`);
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader(CSRF_HEADER, CSRF_HEADER_VALUE);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    request.upload.onload = () => onSent?.();
    request.onload = () => {
      const body = parseJson(request.responseText);
      if (request.status >= 200 && request.status < 300 && body !== undefined) resolve(body as Material);
      else reject(errorFromResponse(request.status, body));
    };
    request.onerror = () => reject(new NetworkError());
    request.ontimeout = () => reject(new NetworkError(MESSAGES.network));
    request.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('The upload was cancelled.', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => request.abort(), { once: true });
    }

    const form = new FormData();
    form.append(MATERIAL_UPLOAD_FIELD, file, file.name);
    request.send(form);
  });
}
