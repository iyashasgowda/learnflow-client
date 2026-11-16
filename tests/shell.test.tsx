import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../src/api/queryClient';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Layout } from '../src/components/Layout';
import { NAV_ITEMS } from '../src/navigation';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { jsonResponse, renderSignedIn, stubApi } from './testUtils';

beforeEach(() => {
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('navigation', () => {
  it('lists every section in the sidebar', async () => {
    await renderSignedIn();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    for (const item of NAV_ITEMS) {
      expect(within(sidebar).getByRole('link', { name: item.label })).toHaveAttribute('href', item.path);
    }
  });

  it('navigates without a reload and updates the page and title', async () => {
    await renderSignedIn();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Planner' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Study Planner' })).toBeInTheDocument();
    expect(document.title).toBe('Study Planner · LearnFlow');
  });

  it('marks the current page for assistive technology', async () => {
    await renderSignedIn('/quiz');
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    expect(within(sidebar).getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows primary items in the bottom bar', async () => {
    await renderSignedIn();
    const bottom = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(bottom).getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
    expect(within(bottom).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(within(bottom).getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('shows a not-found page with a link back to the dashboard', async () => {
    await renderSignedIn('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(document.title).toBe('LearnFlow');
    await userEvent.click(screen.getByRole('link', { name: 'Back to the dashboard' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows empty states, not invented figures, to a user with no activity', async () => {
    await renderSignedIn('/analytics');
    expect(await screen.findByText('No task activity in this range yet.')).toBeInTheDocument();
    expect(screen.getByText('No submitted quizzes in this range yet. Attempts you have not submitted are not counted.')).toBeInTheDocument();
    expect(screen.getByText('No study sessions in this range yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('menu drawer', () => {
  it('toggles with the menu button and closes on Escape', async () => {
    await renderSignedIn();
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from the bottom bar and closes after choosing a destination', async () => {
    await renderSignedIn();
    const more = screen.getByRole('button', { name: 'More' });
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }));
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('closes when the backdrop is clicked', async () => {
    const { container } = await renderSignedIn();
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(toggle);
    await userEvent.click(container.querySelector('.backdrop') as HTMLElement);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('accessibility', () => {
  it('provides a skip link that moves focus to the main content', async () => {
    await renderSignedIn();
    await userEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('labels the theme control', async () => {
    await renderSignedIn();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  function Broken(): never {
    throw new Error('render failure');
  }

  it('shows a recovery message and keeps the shell usable', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ThemeProvider>
        <QueryClientProvider client={createQueryClient()}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/broken']}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/broken" element={<Broken />} />
                  <Route path="/ok" element={<h1>Working page</h1>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('reloads the page from the fallback button', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});

describe('dashboard connection status', () => {
  it('shows the server state and whether AI is configured', async () => {
    await renderSignedIn();
    expect(await screen.findByText(/Connected\. AI features are not configured on the server/)).toBeInTheDocument();
  });

  it('shows that AI is configured', async () => {
    stubApi({ 'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: true } }) });
    await renderSignedIn();
    expect(await screen.findByText(/AI features are configured\./)).toBeInTheDocument();
  });

  it('shows connectivity guidance and recovers on retry', async () => {
    let calls = 0;
    stubApi({
      'GET /api/health': () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return jsonResponse({ status: 'ok', ai: { configured: true } });
      },
    });
    await renderSignedIn();
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Connected\./)).toBeInTheDocument();
  });

  it('shows the server error message for API errors', async () => {
    stubApi({ 'GET /api/health': () => jsonResponse({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }, 500) });
    await renderSignedIn();
    expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('does not update state after unmounting', async () => {
    let resolve: (response: Response) => void = () => undefined;
    stubApi({ 'GET /api/health': () => new Promise<Response>((r) => (resolve = r)) });
    const { unmount } = await renderSignedIn();
    unmount();
    resolve(jsonResponse({ status: 'ok', ai: { configured: true } }));
    await Promise.resolve();
  });
});
