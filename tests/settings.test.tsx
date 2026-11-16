import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderSignedIn, stubApi } from './testUtils';
import type { RouteHandler } from './testUtils';

// The zone this file's browser "detects": a known zone, so adoption can be checked.
vi.mock('../src/time/zone', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/time/zone')>()), detectTimeZone: () => 'Asia/Tokyo' }));

const user = userEvent.setup();

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
});

const SAVED = { theme: 'light', timeZone: 'Europe/Paris', weekStart: 'monday', saved: true };

// A small stand-in for the settings API that applies a change the way the server does.
function settingsServer(initial: Record<string, unknown> = SAVED, extra: Record<string, RouteHandler> = {}) {
  let current = { ...initial };
  const api = stubApi({
    'GET /api/settings': () => jsonResponse(current),
    'PATCH /api/settings': (request) => {
      current = { ...current, ...(request.body as object), saved: true };
      return jsonResponse(current);
    },
    ...extra,
  });
  return { api, current: () => current };
}

const themeField = () => screen.getByLabelText('Theme', { selector: '#setting-theme' });
const zoneField = () => screen.getByLabelText('Time zone');
const weekField = () => screen.getByLabelText('Week starts on');
const patches = (api: ReturnType<typeof stubApi>) => api.callsTo('PATCH /api/settings');

describe('settings page', () => {
  it('shows the saved values and only controls that do something', async () => {
    settingsServer();
    await renderSignedIn('/settings');
    expect(await screen.findByLabelText('Time zone')).toHaveValue('Europe/Paris');
    expect(themeField()).toHaveValue('light');
    expect(weekField()).toHaveValue('monday');
    // Three working preferences: no switch, toggle or option that does nothing.
    const preferences = screen.getByRole('region', { name: 'Preferences' });
    expect(within(preferences).getAllByRole('combobox')).toHaveLength(3);
    expect(within(preferences).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(preferences).queryByRole('switch')).not.toBeInTheDocument();
  });

  it('lists the account actions with links to their own sections', async () => {
    settingsServer();
    await renderSignedIn('/settings');
    expect(await screen.findByRole('link', { name: 'Change your password' })).toHaveAttribute('href', '#change-password-heading');
    expect(screen.getByRole('link', { name: 'Delete your account' })).toHaveAttribute('href', '#delete-heading');
    expect(screen.getByRole('heading', { level: 2, name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Delete account' })).toBeInTheDocument();
  });

  it('offers every zone the browser knows, and the current one even if the list lacks it', async () => {
    settingsServer({ ...SAVED, timeZone: 'Antarctica/Troll' });
    await renderSignedIn('/settings');
    const field = await screen.findByLabelText('Time zone');
    expect(within(field).getByRole('option', { name: 'America/New York' })).toBeInTheDocument();
    expect(within(field).getByRole('option', { name: 'UTC' })).toBeInTheDocument();
    expect(field).toHaveValue('Antarctica/Troll');
  });

  it('applies the saved theme as soon as it loads', async () => {
    settingsServer({ ...SAVED, theme: 'dark' });
    await renderSignedIn('/settings');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(window.localStorage.getItem('learnflow.theme.v1')).toBe('dark');
  });

  it('shows a loading message, then an error with a retry when settings cannot be loaded', async () => {
    let fail = true;
    settingsServer(SAVED, { 'GET /api/settings': () => (fail ? errorResponse('INTERNAL', 'Settings are unavailable.', 500) : jsonResponse(SAVED)) });
    await renderSignedIn('/settings');
    const alert = await screen.findByText('Settings are unavailable.');
    expect(alert).toBeInTheDocument();
    expect(screen.queryByLabelText('Time zone')).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Time zone')).toHaveValue('Europe/Paris');
  });
});

describe('changing a setting', () => {
  it('saves the theme, applies it at once and says it was saved', async () => {
    const { api, current } = settingsServer();
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    await user.selectOptions(themeField(), 'dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => expect(patches(api)).toHaveLength(1));
    expect(patches(api)[0]?.body).toEqual({ theme: 'dark' });
    expect(await screen.findByText('Theme saved.')).toBeInTheDocument();
    expect(current().theme).toBe('dark');
    expect(themeField()).toHaveValue('dark');
  });

  it('saves the time zone and the week start, each as its own change', async () => {
    const { api } = settingsServer();
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    fireEvent.change(zoneField(), { target: { value: 'Asia/Tokyo' } });
    expect(await screen.findByText('Time zone saved.')).toBeInTheDocument();
    await user.selectOptions(weekField(), 'sunday');
    expect(await screen.findByText('Week start saved.')).toBeInTheDocument();
    expect(patches(api).map((request) => request.body)).toEqual([{ timeZone: 'Asia/Tokyo' }, { weekStart: 'sunday' }]);
    expect(zoneField()).toHaveValue('Asia/Tokyo');
    expect(weekField()).toHaveValue('sunday');
  });

  it('puts the previous theme back and says so when the server refuses', async () => {
    let release: (response: Response) => void = () => undefined;
    // The save stays pending until the test lets it fail, so the optimistic change can be seen first.
    stubApi({
      'GET /api/settings': () => jsonResponse(SAVED),
      'PATCH /api/settings': () => new Promise<Response>((resolve) => (release = resolve)),
    });
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    await user.selectOptions(themeField(), 'dark');
    // The change is shown while it is being saved.
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    release(errorResponse('INTERNAL', 'The server had a problem.', 500));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save: The server had a problem. Your previous setting is back.');
    await waitFor(() => expect(themeField()).toHaveValue('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('puts the previous value back after a network failure', async () => {
    stubApi({
      'GET /api/settings': () => jsonResponse(SAVED),
      'PATCH /api/settings': () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    fireEvent.change(zoneField(), { target: { value: 'Asia/Tokyo' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server.*Your previous setting is back\./);
    expect(zoneField()).toHaveValue('Europe/Paris');
  });

  it('shows the server\'s reason for refusing a time zone and keeps the old one', async () => {
    settingsServer(SAVED, {
      'PATCH /api/settings': () => errorResponse('VALIDATION_ERROR', 'The request is invalid.', 400, { fields: [{ path: 'timeZone', message: 'Choose a time zone from the list.' }] }),
    });
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    fireEvent.change(zoneField(), { target: { value: 'Asia/Tokyo' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a time zone from the list.');
    expect(zoneField()).toHaveValue('Europe/Paris');
  });

  it('keeps a saved value after a failed change of another one', async () => {
    let fail = false;
    const { current } = settingsServer(SAVED, {
      'PATCH /api/settings': (request) => {
        if (fail) return errorResponse('INTERNAL', 'Nope.', 500);
        return jsonResponse(Object.assign(current(), request.body));
      },
    });
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    await user.selectOptions(weekField(), 'sunday');
    expect(await screen.findByText('Week start saved.')).toBeInTheDocument();
    fail = true;
    await user.selectOptions(themeField(), 'dark');
    await screen.findByRole('alert');
    expect(weekField()).toHaveValue('sunday');
    expect(themeField()).toHaveValue('light');
  });

  it('saves the theme chosen in the header to the account, and shows it in the settings', async () => {
    const { api } = settingsServer();
    await renderSignedIn('/settings');
    await screen.findByLabelText('Time zone');
    const header = screen.getAllByLabelText('Theme').find((element) => element.id !== 'setting-theme') as HTMLElement;
    await user.selectOptions(header, 'dark');
    await waitFor(() => expect(patches(api)).toHaveLength(1));
    expect(patches(api)[0]?.body).toEqual({ theme: 'dark' });
    await waitFor(() => expect(themeField()).toHaveValue('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('a user who has not chosen a time zone yet', () => {
  it('gets the browser\'s zone, once', async () => {
    const { api, current } = settingsServer({ theme: 'system', timeZone: 'UTC', weekStart: 'monday', saved: false });
    await renderSignedIn('/settings');
    expect(await screen.findByLabelText('Time zone')).toHaveValue('Asia/Tokyo');
    await waitFor(() => expect(patches(api)).toHaveLength(1));
    expect(patches(api)[0]?.body).toEqual({ timeZone: 'Asia/Tokyo' });
    expect(current().timeZone).toBe('Asia/Tokyo');
  });

  it('does not overwrite a zone that was saved', async () => {
    const { api } = settingsServer({ theme: 'system', timeZone: 'UTC', weekStart: 'monday', saved: true });
    await renderSignedIn('/settings');
    expect(await screen.findByLabelText('Time zone')).toHaveValue('UTC');
    expect(patches(api)).toHaveLength(0);
  });

  it('carries on with the defaults if saving the detected zone fails', async () => {
    settingsServer({ theme: 'system', timeZone: 'UTC', weekStart: 'monday', saved: false }, { 'PATCH /api/settings': () => errorResponse('INTERNAL', 'Nope.', 500) });
    await renderSignedIn('/settings');
    expect(await screen.findByLabelText('Time zone')).toBeInTheDocument();
    await waitFor(() => expect(zoneField()).toHaveValue('UTC'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the planner needs the time zone first', () => {
  it('asks for sessions only once the settings are known', async () => {
    let release: (response: Response) => void = () => undefined;
    const api = stubApi({
      'GET /api/settings': () => new Promise<Response>((resolve) => (release = resolve)),
      'GET /api/sessions': () => jsonResponse({ items: [] }),
    });
    await renderSignedIn('/planner');
    expect(await screen.findByText('Loading your settings…')).toBeInTheDocument();
    expect(api.callsTo('GET /api/sessions')).toHaveLength(0);
    release(jsonResponse({ ...SAVED, timeZone: 'America/New_York' }));
    expect(await screen.findByText('No study sessions this week.')).toBeInTheDocument();
    expect(api.callsTo('GET /api/sessions')).toHaveLength(1);
  });

  it('shows why it cannot start, with a retry, when the settings cannot be loaded', async () => {
    let fail = true;
    stubApi({
      'GET /api/settings': () => (fail ? errorResponse('INTERNAL', 'Settings are unavailable.', 500) : jsonResponse(SAVED)),
      'GET /api/sessions': () => jsonResponse({ items: [] }),
    });
    await renderSignedIn('/planner');
    expect(await screen.findByText('Settings are unavailable.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No study sessions this week.')).toBeInTheDocument();
  });
});
