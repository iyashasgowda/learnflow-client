import { render, screen } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AppRoutes } from '../src/App';
import type { Task, TaskListResponse } from '../src/api/tasks';
import { createQueryClient } from '../src/api/queryClient';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { detectTimeZone } from '../src/time/zone';

export const USER = { id: 'user-1', email: 'ada@example.com', emailVerified: true, aiDisclosureAcknowledged: true, createdAt: '2030-01-01T00:00:00.000Z' };

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const errorResponse = (code: string, message: string, status: number, details?: Record<string, unknown>) =>
  jsonResponse({ code, message, ...(details ? { details } : {}) }, status);

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

export type RouteHandler = (request: RecordedRequest) => Response | Promise<Response>;

export const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Read chapter 4',
  description: '',
  dueDate: null,
  priority: 'medium',
  status: 'active',
  overdue: false,
  completedAt: null,
  version: 1,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

export const taskList = (items: Task[], extra: Partial<TaskListResponse> = {}): TaskListResponse => ({
  items,
  page: 1,
  pageSize: 10,
  total: items.length,
  ...extra,
});

export const summary = (tasks: Partial<{ total: number; active: number; completed: number; overdue: number; completionRate: number }> = {}) => ({
  tasks: { total: 0, active: 0, completed: 0, overdue: 0, completionRate: 0, ...tasks },
});

// The browser's own zone, so times in tests read the same as the platform would show them.
export const SETTINGS = { theme: 'system', timeZone: detectTimeZone(), weekStart: 'monday', saved: true } as const;

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

// What analytics returns for a user without activity: zeros, empty trends, and a zero-filled series.
export function emptyAnalytics(range: keyof typeof RANGE_DAYS = '7d') {
  const last = Date.UTC(2030, 5, 15);
  const days = Array.from({ length: RANGE_DAYS[range] }, (_, index) => new Date(last - (RANGE_DAYS[range] - 1 - index) * 86_400_000).toISOString().slice(0, 10));
  return {
    range,
    timeZone: SETTINGS.timeZone,
    from: days[0],
    to: days[days.length - 1],
    tasks: { created: 0, completed: 0, activeInRange: 0, completionRate: 0, series: days.map((date) => ({ date, created: 0, completed: 0 })) },
    quizzes: { attempts: 0, quizzes: 0, averageScorePercent: null, trend: [] },
    study: { totalMinutes: 0, series: days.map((date) => ({ date, minutes: 0 })) },
  };
}

const defaultRoutes: Record<string, RouteHandler> = {
  'GET /api/auth/me': () => jsonResponse({ user: USER }),
  'GET /api/settings': () => jsonResponse(SETTINGS),
  'GET /api/sessions': () => jsonResponse({ items: [] }),
  'GET /api/analytics': (request) => jsonResponse(emptyAnalytics((new URLSearchParams(request.path.split('?')[1]).get('range') ?? '7d') as keyof typeof RANGE_DAYS)),
  'GET /api/activity': () => jsonResponse({ items: [] }),
  'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: false } }),
  'GET /api/dashboard/summary': () => jsonResponse(summary()),
  'GET /api/tasks': () => jsonResponse(taskList([])),
  'GET /api/materials': () => jsonResponse({ items: [], limits: { maxUploadBytes: 50 * 1024 * 1024 } }),
  'POST /api/auth/logout': () => new Response(null, { status: 204 }),
};

// Stubs fetch with per-route handlers; unexpected requests fail loudly.
export function stubApi(overrides: Record<string, RouteHandler> = {}) {
  const routes = { ...defaultRoutes, ...overrides };
  const calls: RecordedRequest[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const request: RecordedRequest = {
      method,
      path,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(request);
    // Handlers are keyed without the query string; they still receive the full path.
    const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
    if (!handler) throw new Error(`Unexpected request: ${method} ${path}`);
    return handler(request);
  });
  vi.stubGlobal('fetch', mock);
  // A key without a query string matches calls with any query.
  const callsTo = (key: string) =>
    calls.filter((call) => {
      const full = `${call.method} ${call.path}`;
      return full === key || full.split('?')[0] === key;
    });
  return { calls, mock, callsTo };
}

export function renderApp(path = '/', client: QueryClient = createQueryClient()) {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

// Renders and waits until the signed-in shell is on screen.
export async function renderSignedIn(path = '/', client?: QueryClient) {
  const result = renderApp(path, client);
  await screen.findByRole('main');
  return result;
}
