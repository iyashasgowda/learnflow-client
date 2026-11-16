import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { Material } from '../src/api/materials';

type Listener = (event?: unknown) => void;

// A controllable stand-in for XMLHttpRequest: the test decides when progress, completion, and failures happen.
export class FakeXhr {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  headers: Record<string, string> = {};
  status = 0;
  responseText = '';
  body: FormData | null = null;
  aborted = false;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: Listener | null } = { onprogress: null, onload: null };
  onload: Listener | null = null;
  onerror: Listener | null = null;
  ontimeout: Listener | null = null;
  onabort: Listener | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: FormData) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  get file(): File {
    return this.body?.get('file') as File;
  }

  progress(loaded: number, total: number) {
    act(() => this.upload.onprogress?.({ lengthComputable: true, loaded, total }));
  }

  sent() {
    act(() => this.upload.onload?.());
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    act(() => this.onload?.());
  }

  networkError() {
    act(() => this.onerror?.());
  }

  timeout() {
    act(() => this.ontimeout?.());
  }
}

export function installFakeXhr() {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return FakeXhr;
}

export const makeMaterial = (overrides: Partial<Material> = {}): Material => ({
  id: 'material-1',
  name: 'notes.txt',
  fileType: 'txt',
  sizeBytes: 2048,
  status: 'ready',
  failureReason: null,
  charCount: 1500,
  truncated: false,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const materialList = (items: Material[], maxUploadBytes = MAX_UPLOAD_BYTES) => ({ items, limits: { maxUploadBytes } });

export const makeFile = (name: string, content: string | number = 'hello', type = 'text/plain') =>
  new File([typeof content === 'number' ? new Uint8Array(content) : content], name, { type });
