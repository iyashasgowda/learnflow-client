import {
  API_PREFIX,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  ERROR_CODES,
  HTTP_NO_CONTENT,
  MESSAGES,
  NETWORK_ERROR_CODE,
  UNKNOWN_ERROR_CODE,
  UNSAFE_METHODS,
} from '../constants';
import type { components } from './schema';

export type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
export type HealthResponse = components['schemas']['HealthResponse'];

let unauthorizedHandler: (() => void) | undefined;

// Called when the server reports that the session is no longer valid.
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NetworkError extends Error {
  readonly code = NETWORK_ERROR_CODE;

  constructor(message: string = MESSAGES.network) {
    super(message);
    this.name = 'NetworkError';
  }
}

const isEnvelope = (value: unknown): value is ErrorEnvelope =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ErrorEnvelope).code === 'string' &&
  typeof (value as ErrorEnvelope).message === 'string';

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// Turns a failed response body into an ApiError; a lost session also notifies the app.
export function errorFromResponse(status: number, body: unknown): ApiError {
  if (isEnvelope(body)) {
    if (body.code === ERROR_CODES.UNAUTHENTICATED) unauthorizedHandler?.();
    return new ApiError(status, body.code, body.message, body.details);
  }
  return new ApiError(status, UNKNOWN_ERROR_CODE, MESSAGES.unexpectedResponse);
}

// Paths must be relative and under /api so the dev proxy and the production proxy both apply.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith(`${API_PREFIX}/`)) {
    throw new Error(`API paths must be relative and start with ${API_PREFIX}/`);
  }

  let response: Response;
  const method = (init.method ?? 'GET').toUpperCase();
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(UNSAFE_METHODS.includes(method) ? { [CSRF_HEADER]: CSRF_HEADER_VALUE } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NetworkError();
  }

  if (response.ok && response.status === HTTP_NO_CONTENT) {
    return undefined as T;
  }

  const body = await readJson(response);
  if (!response.ok) {
    throw errorFromResponse(response.status, body);
  }
  if (body === undefined) {
    throw new ApiError(response.status, UNKNOWN_ERROR_CODE, MESSAGES.unexpectedResponse);
  }
  return body as T;
}

export const getHealth = (signal?: AbortSignal): Promise<HealthResponse> =>
  apiFetch<HealthResponse>(`${API_PREFIX}/health`, signal ? { signal } : {});
