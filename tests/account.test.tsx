import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { createQueryClient } from '../src/api/queryClient';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { errorResponse, jsonResponse, stubApi, USER } from './testUtils';

const UNVERIFIED = { ...USER, emailVerified: false };
const signedOut = () => ({ 'GET /api/auth/me': () => errorResponse('UNAUTHENTICATED', 'You need to sign in to do that.', 401) });
const signedInUnverified = () => ({ 'GET /api/auth/me': () => jsonResponse({ user: UNVERIFIED }) });
const status = (value: string) => jsonResponse({ status: value }, 202);
const noContent = () => new Response(null, { status: 204 });

function Probe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

// Strict mode runs effects twice in development, which is how a one-time token can be wasted.
function renderAt(path: string) {
  return render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={createQueryClient()}>
          <AuthProvider>
            <MemoryRouter initialEntries={[path]}>
              <AppRoutes />
              <Probe />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

const location = () => screen.getByTestId('location').textContent;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verification banner', () => {
  it('appears for an unverified user with their address and a resend action', async () => {
    stubApi(signedInUnverified());
    renderAt('/');
    const banner = await screen.findByRole('region', { name: 'Email verification' });
    expect(banner).toHaveTextContent('Verify your email to use AI features');
    expect(banner).toHaveTextContent('ada@example.com');
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled();
  });

  it('is not shown to verified users', async () => {
    stubApi();
    renderAt('/');
    await screen.findByRole('main');
    expect(screen.queryByRole('region', { name: 'Email verification' })).not.toBeInTheDocument();
  });

  it('sends a new email with the CSRF header and confirms it', async () => {
    const api = stubApi({ ...signedInUnverified(), 'POST /api/auth/verify/resend': () => status('sent') });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend email' }));
    expect(await screen.findByText('We sent a new link to ada@example.com. Earlier links no longer work.')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/verify/resend')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
  });

  it('disables the button while sending, so repeated clicks send one email', async () => {
    let release: (response: Response) => void = () => undefined;
    const api = stubApi({ ...signedInUnverified(), 'POST /api/auth/verify/resend': () => new Promise<Response>((resolve) => (release = resolve)) });
    renderAt('/');
    const button = await screen.findByRole('button', { name: 'Resend email' });
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Sending…' }));
    expect(api.callsTo('POST /api/auth/verify/resend')).toHaveLength(1);
    release(status('sent'));
    expect(await screen.findByText(/We sent a new link/)).toBeInTheDocument();
  });

  it('tells the user how long to wait when rate limited', async () => {
    stubApi({
      ...signedInUnverified(),
      'POST /api/auth/verify/resend': () => errorResponse('RATE_LIMITED', 'Too many.', 429, { retryAfterSeconds: 300 }),
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 5 minutes and try again.');
  });

  it('explains when the email could not be sent', async () => {
    stubApi({
      ...signedInUnverified(),
      'POST /api/auth/verify/resend': () => errorResponse('MAIL_UNAVAILABLE', 'The email could not be sent right now. Please try again later.', 503),
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The email could not be sent right now');
  });

  it('refreshes and disappears when the address turns out to be verified already', async () => {
    let verified = false;
    stubApi({
      'GET /api/auth/me': () => jsonResponse({ user: verified ? USER : UNVERIFIED }),
      'POST /api/auth/verify/resend': () => {
        verified = true;
        return errorResponse('ALREADY_VERIFIED', 'Already verified.', 409);
      },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend email' }));
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'Email verification' })).not.toBeInTheDocument());
  });
});

describe('verify page', () => {
  it('verifies once even when effects run twice, and removes the token from the address', async () => {
    const api = stubApi({ ...signedOut(), 'POST /api/auth/verify': () => jsonResponse({ status: 'verified' }) });
    renderAt('/verify?token=abc123');
    expect(await screen.findByText(/Your email address is verified/)).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/verify')).toHaveLength(1);
    expect(api.callsTo('POST /api/auth/verify')[0]?.body).toEqual({ token: 'abc123' });
    expect(api.callsTo('POST /api/auth/verify')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(location()).toBe('/verify');
  });

  it('refreshes the signed-in user so the banner goes away', async () => {
    let verified = false;
    stubApi({
      'GET /api/auth/me': () => jsonResponse({ user: verified ? USER : UNVERIFIED }),
      'POST /api/auth/verify': () => {
        verified = true;
        return jsonResponse({ status: 'verified' });
      },
    });
    renderAt('/verify?token=abc123');
    await screen.findByText(/Your email address is verified/);
    await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Go to LearnFlow' })).toBeInTheDocument());
  });

  it('explains an invalid or expired link and, when signed in, offers a new one', async () => {
    const api = stubApi({
      ...signedInUnverified(),
      'POST /api/auth/verify': () => errorResponse('INVALID_TOKEN', 'This link is invalid or has expired.', 400),
      'POST /api/auth/verify/resend': () => status('sent'),
    });
    renderAt('/verify?token=old');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is invalid or has expired.');
    await userEvent.click(await screen.findByRole('button', { name: 'Send me a new link' }));
    expect(await screen.findByText(/We sent a new link/)).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/verify/resend')).toHaveLength(1);
  });

  it('asks signed-out visitors to sign in to get a new link', async () => {
    stubApi({ ...signedOut(), 'POST /api/auth/verify': () => errorResponse('INVALID_TOKEN', 'x', 400) });
    renderAt('/verify?token=old');
    await screen.findByRole('alert');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Send me a new link' })).not.toBeInTheDocument();
  });

  it('does not call the server when the link has no token', async () => {
    const api = stubApi(signedOut());
    renderAt('/verify');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is incomplete.');
    expect(api.callsTo('POST /api/auth/verify')).toHaveLength(0);
  });
});

describe('forgot password', () => {
  it('is reachable from the login page', async () => {
    stubApi(signedOut());
    renderAt('/login');
    await userEvent.click(await screen.findByRole('link', { name: 'Forgot your password?' }));
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(location()).toBe('/forgot-password');
  });

  it('validates the address before calling the server', async () => {
    const api = stubApi(signedOut());
    renderAt('/forgot-password');
    await userEvent.click(await screen.findByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Email'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/forgot')).toHaveLength(0);
  });

  it('shows the same confirmation whatever the server knows about the address', async () => {
    const api = stubApi({ ...signedOut(), 'POST /api/auth/forgot': () => status('ok') });
    renderAt('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), ' ghost@example.com ');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('If an account exists for ghost@example.com');
    expect(api.callsTo('POST /api/auth/forgot')[0]?.body).toEqual({ email: 'ghost@example.com' });
    expect(api.callsTo('POST /api/auth/forgot')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
  });

  it('tells the user how long to wait when rate limited', async () => {
    stubApi({ ...signedOut(), 'POST /api/auth/forgot': () => errorResponse('RATE_LIMITED', 'x', 429, { retryAfterSeconds: 900 }) });
    renderAt('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 15 minutes and try again.');
  });

  it('suggests retrying when the server cannot be reached', async () => {
    stubApi({
      ...signedOut(),
      'POST /api/auth/forgot': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderAt('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
  });
});

describe('reset password', () => {
  const fill = async (password: string, confirm = password) => {
    await userEvent.type(await screen.findByLabelText('New password'), password);
    await userEvent.type(screen.getByLabelText('Repeat the new password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  };

  it('asks for a new link when the address has no token', async () => {
    stubApi(signedOut());
    renderAt('/reset-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is incomplete');
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('removes the token from the address and validates before calling the server', async () => {
    const api = stubApi(signedOut());
    renderAt('/reset-password?token=secret-token');
    await screen.findByLabelText('New password');
    expect(location()).toBe('/reset-password');

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Enter a password.')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveFocus();
    await fill('short');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/reset')).toHaveLength(0);
  });

  it('requires the two passwords to match', async () => {
    const api = stubApi(signedOut());
    renderAt('/reset-password?token=t');
    await fill('a brand new password', 'a different password');
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/reset')).toHaveLength(0);
  });

  it('changes the password and sends the user to sign in with a confirmation', async () => {
    const api = stubApi({ ...signedOut(), 'POST /api/auth/reset': noContent });
    renderAt('/reset-password?token=secret-token');
    await fill('a brand new password');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your password was changed. Sign in with the new one.');
    expect(api.callsTo('POST /api/auth/reset')[0]?.body).toEqual({ token: 'secret-token', password: 'a brand new password' });
    expect(api.callsTo('POST /api/auth/reset')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
  });

  it('explains an expired link and offers a new one', async () => {
    stubApi({ ...signedOut(), 'POST /api/auth/reset': () => errorResponse('INVALID_TOKEN', 'x', 400) });
    renderAt('/reset-password?token=old');
    await fill('a brand new password');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This link is invalid or has expired.');
    expect(alert).toContainElement(screen.getByRole('link', { name: 'Request a new link' }));
  });

  it('shows server-side password complaints on the field', async () => {
    stubApi({
      ...signedOut(),
      'POST /api/auth/reset': () =>
        errorResponse('VALIDATION_ERROR', 'invalid', 400, { fields: [{ path: 'password', message: 'Server says too weak.' }] }),
    });
    renderAt('/reset-password?token=t');
    await fill('a brand new password');
    expect(await screen.findByText('Server says too weak.')).toBeInTheDocument();
  });
});

describe('settings: account', () => {
  it('shows the address and verification status', async () => {
    stubApi();
    renderAt('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getAllByText('ada@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByText(/Not verified/)).not.toBeInTheDocument();
  });

  it('offers to resend the verification email when the address is not verified', async () => {
    const api = stubApi({ ...signedInUnverified(), 'POST /api/auth/verify/resend': () => status('sent') });
    renderAt('/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findAllByText(/We sent a new link/)).not.toHaveLength(0);
    expect(api.callsTo('POST /api/auth/verify/resend')).toHaveLength(1);
  });
});

describe('settings: change password', () => {
  const open = async (overrides = {}) => {
    const api = stubApi(overrides);
    renderAt('/settings');
    await screen.findByRole('heading', { name: 'Change password' });
    return api;
  };
  const fill = async (current: string, next: string, confirm = next) => {
    await userEvent.type(screen.getByLabelText('Current password'), current);
    await userEvent.type(screen.getByLabelText('New password'), next);
    await userEvent.type(screen.getByLabelText('Repeat the new password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  };

  it('validates every field before calling the server', async () => {
    const api = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByText('Enter a password.')).toBeInTheDocument();
    expect(screen.getByText('Type the new password again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveFocus();
    expect(api.callsTo('POST /api/auth/password')).toHaveLength(0);
  });

  it('rejects a short new password and a mismatch', async () => {
    const api = await open();
    await fill('old password', 'short', 'short');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/password')).toHaveLength(0);
  });

  it('changes the password, clears the form, and says what else happened', async () => {
    const api = await open({ 'POST /api/auth/password': noContent });
    await fill('old password', 'a brand new password');
    expect(await screen.findByText('Password changed. You were signed out on your other devices.')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/password')[0]?.body).toEqual({ currentPassword: 'old password', newPassword: 'a brand new password' });
    expect(api.callsTo('POST /api/auth/password')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('marks a wrong current password on its own field', async () => {
    await open({ 'POST /api/auth/password': () => errorResponse('INVALID_PASSWORD', 'wrong', 401) });
    await fill('not my password', 'a brand new password');
    expect(await screen.findByText('That password is not correct. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Current password')).toHaveFocus();
  });

  it('tells the user how long to wait when rate limited', async () => {
    await open({ 'POST /api/auth/password': () => errorResponse('RATE_LIMITED', 'x', 429, { retryAfterSeconds: 120 }) });
    await fill('old password', 'a brand new password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 2 minutes and try again.');
  });

  it('keeps the form usable while a request runs and sends it once', async () => {
    let release: (response: Response) => void = () => undefined;
    const api = await open({ 'POST /api/auth/password': () => new Promise<Response>((resolve) => (release = resolve)) });
    await fill('old password', 'a brand new password');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(api.callsTo('POST /api/auth/password')).toHaveLength(1);
    release(noContent());
    expect(await screen.findByRole('button', { name: 'Change password' })).toBeEnabled();
  });
});

describe('settings: delete account', () => {
  const open = async (overrides = {}) => {
    const api = stubApi(overrides);
    renderAt('/settings');
    await screen.findByRole('heading', { name: 'Delete account' });
    return api;
  };

  it('requires an explicit confirmation step before asking for the password', async () => {
    await open();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    expect(screen.getByRole('form', { name: 'Confirm account deletion' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.getByText(/Are you sure\?/)).toBeInTheDocument();
  });

  it('can be cancelled without calling the server', async () => {
    const api = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await userEvent.type(screen.getByLabelText('Password'), 'typed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete my account…' })).toBeInTheDocument();
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('asks for the password instead of sending an empty request', async () => {
    const api = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Permanently delete my account' }));
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  });

  it('keeps the account and shows the problem when the password is wrong', async () => {
    await open({ 'DELETE /api/account': () => errorResponse('INVALID_PASSWORD', 'wrong', 401) });
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await userEvent.type(screen.getByLabelText('Password'), 'not mine');
    await userEvent.click(screen.getByRole('button', { name: 'Permanently delete my account' }));
    expect(await screen.findByText('That password is not correct. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });

  it('deletes the account, signs out, and confirms on the login page', async () => {
    const api = await open({ 'DELETE /api/account': noContent });
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Permanently delete my account' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your account was deleted. All of its data has been removed.');
    const [call] = api.callsTo('DELETE /api/account');
    expect(call?.body).toEqual({ password: 'correct horse battery' });
    expect(call?.headers.get('X-Requested-With')).toBe('LearnFlow');
  });

  it('suggests retrying when the server cannot be reached', async () => {
    await open({
      'DELETE /api/account': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Permanently delete my account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
  });
});
