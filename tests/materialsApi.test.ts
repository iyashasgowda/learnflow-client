import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, setUnauthorizedHandler } from '../src/api/client';
import { uploadMaterial } from '../src/api/materials';
import { FakeXhr, installFakeXhr, makeFile, makeMaterial } from './fakeXhr';

beforeEach(() => {
  installFakeXhr();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(undefined);
});

describe('uploadMaterial', () => {
  it('posts the file as multipart form data with the CSRF header', () => {
    void uploadMaterial(makeFile('notes.txt', 'abc'));
    const [xhr] = FakeXhr.instances;
    expect(xhr?.method).toBe('POST');
    expect(xhr?.url).toBe('/api/materials');
    expect(xhr?.headers).toMatchObject({ 'X-Requested-With': 'LearnFlow', Accept: 'application/json' });
    expect(xhr?.body).toBeInstanceOf(FormData);
    expect(xhr?.file.name).toBe('notes.txt');
  });

  it('reports progress only when the total is known', () => {
    const onProgress = vi.fn();
    const onSent = vi.fn();
    void uploadMaterial(makeFile('a.txt'), { onProgress, onSent });
    const [xhr] = FakeXhr.instances;
    xhr?.progress(50, 200);
    xhr?.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 });
    xhr?.upload.onprogress?.({ lengthComputable: true, loaded: 0, total: 0 });
    xhr?.sent();
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.25);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('works without any handlers', async () => {
    const promise = uploadMaterial(makeFile('a.txt'));
    const [xhr] = FakeXhr.instances;
    xhr?.progress(1, 2);
    xhr?.sent();
    xhr?.respond(201, makeMaterial());
    await expect(promise).resolves.toMatchObject({ id: 'material-1' });
  });

  it('resolves with the material on success', async () => {
    const promise = uploadMaterial(makeFile('a.txt'));
    FakeXhr.instances[0]?.respond(201, makeMaterial({ name: 'a.txt' }));
    await expect(promise).resolves.toMatchObject({ name: 'a.txt', status: 'ready' });
  });

  it('rejects with the server\'s error envelope', async () => {
    const promise = uploadMaterial(makeFile('a.exe'));
    FakeXhr.instances[0]?.respond(415, { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Nope.', details: { supported: '.txt' } });
    const error = await promise.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Nope.', details: { supported: '.txt' } });
  });

  it('rejects with a general error when the answer is not an envelope, or a success is not JSON', async () => {
    const first = uploadMaterial(makeFile('a.txt'));
    FakeXhr.instances[0]?.respond(502, '<html>Bad gateway</html>');
    await expect(first).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });

    const second = uploadMaterial(makeFile('b.txt'));
    FakeXhr.instances[1]?.respond(201, 'not json');
    await expect(second).rejects.toMatchObject({ status: 201, code: 'UNKNOWN_ERROR' });
  });

  it('tells the app the session ended when the server says so', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const promise = uploadMaterial(makeFile('a.txt'));
    FakeXhr.instances[0]?.respond(401, { code: 'UNAUTHENTICATED', message: 'You need to sign in to do that.' });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects with a network error on a connection failure or timeout', async () => {
    const dropped = uploadMaterial(makeFile('a.txt'));
    FakeXhr.instances[0]?.networkError();
    await expect(dropped).rejects.toBeInstanceOf(NetworkError);

    const slow = uploadMaterial(makeFile('b.txt'));
    FakeXhr.instances[1]?.timeout();
    await expect(slow).rejects.toBeInstanceOf(NetworkError);
  });

  it('can be cancelled with an abort signal', async () => {
    const controller = new AbortController();
    const promise = uploadMaterial(makeFile('a.txt'), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.instances[0]?.aborted).toBe(true);
  });

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(uploadMaterial(makeFile('a.txt'), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.instances[0]?.body).toBeNull();
  });
});
