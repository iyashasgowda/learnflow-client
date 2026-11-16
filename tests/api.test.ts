import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, apiFetch, getHealth, setUnauthorizedHandler } from '../src/api/client';
import { getCurrentUser, login, logout, register } from '../src/api/auth';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const stubFetch = (impl: (...args: Parameters<typeof fetch>) => Promise<Response>) => {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(undefined);
});

describe('CSRF header', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('is sent on %s requests', async (method) => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({})));
    await apiFetch('/api/things', { method });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('X-Requested-With')).toBe('LearnFlow');
  });

  it('is not sent on GET requests', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({})));
    await apiFetch('/api/things');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-Requested-With')).toBeNull();
  });
});

describe('empty responses', () => {
  it('resolves undefined for 204 No Content', async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    await expect(apiFetch('/api/things', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('session expiry hook', () => {
  it('is called when the server says the session is not valid', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(() => Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'sign in' }, 401)));
    await expect(apiFetch('/api/things')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is not called for other errors, including wrong credentials', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(() => Promise.resolve(jsonResponse({ code: 'INVALID_CREDENTIALS', message: 'no' }, 401)));
    await expect(apiFetch('/api/things')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('auth endpoints', () => {
  const USER = { id: 'u', email: 'a@b.co', createdAt: '2030-01-01T00:00:00.000Z' };

  it('reads the current user', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ user: USER })));
    const controller = new AbortController();
    await expect(getCurrentUser(controller.signal)).resolves.toEqual(USER);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
    await expect(getCurrentUser()).resolves.toEqual(USER);
  });

  it('posts credentials as JSON for login and register', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ user: USER })));
    await expect(login({ email: 'a@b.co', password: 'pw' })).resolves.toEqual(USER);
    await expect(register({ email: 'a@b.co', password: 'long enough pw', acceptTerms: true })).resolves.toEqual(USER);
    const [loginCall, registerCall] = fetchMock.mock.calls;
    expect(loginCall?.[0]).toBe('/api/auth/login');
    expect(registerCall?.[0]).toBe('/api/auth/register');
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({ email: 'a@b.co', password: 'pw' });
    expect(new Headers(loginCall?.[1]?.headers).get('Content-Type')).toBe('application/json');
  });

  it('posts logout without a body', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/logout');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});

describe('apiFetch', () => {
  it('returns parsed JSON for successful responses using a relative path', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ status: 'ok' })));
    await expect(apiFetch('/api/health')).resolves.toEqual({ status: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/health');
    expect(init).toMatchObject({ credentials: 'same-origin' });
  });

  it('raises ApiError carrying code, message, and details from the error envelope', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ code: 'VALIDATION_ERROR', message: 'Bad input', details: { fields: [] } }, 400)),
    );
    const error = await apiFetch('/api/things').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Bad input', details: { fields: [] } });
  });

  it('raises a generic ApiError when an error response is not an envelope', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })));
    const error = await apiFetch('/api/things').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
    expect((error as ApiError).message).not.toContain('html');
  });

  it('raises a generic ApiError when a success response is not JSON', async () => {
    stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })));
    await expect(apiFetch('/api/things')).rejects.toMatchObject({ code: 'UNKNOWN_ERROR' });
  });

  it('raises a distinct NetworkError when the request cannot be made', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await apiFetch('/api/health').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as NetworkError).code).toBe('NETWORK_ERROR');
  });

  it('rethrows aborts so callers can ignore them', async () => {
    stubFetch(() => Promise.reject(new DOMException('Aborted', 'AbortError')));
    await expect(apiFetch('/api/health')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects absolute URLs and paths outside /api', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({})));
    await expect(apiFetch('http://localhost:8787/api/health')).rejects.toThrow(/relative/);
    await expect(apiFetch('/other')).rejects.toThrow(/relative/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getHealth', () => {
  it('requests /api/health and passes the abort signal', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ status: 'ok', ai: { configured: false } })));
    const controller = new AbortController();
    await expect(getHealth(controller.signal)).resolves.toEqual({ status: 'ok', ai: { configured: false } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it('works without a signal', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ status: 'ok', ai: { configured: true } })));
    await expect(getHealth()).resolves.toMatchObject({ ai: { configured: true } });
  });
});
