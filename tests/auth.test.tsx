import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destinationFrom, describeAuthError, validateEmail, validateExistingPassword, validateNewPassword } from '../src/auth/authForm';
import { ApiError, NetworkError } from '../src/api/client';
import { errorResponse, jsonResponse, renderApp, renderSignedIn, stubApi, USER } from './testUtils';

const signedOut = () => ({ 'GET /api/auth/me': () => errorResponse('UNAUTHENTICATED', 'You need to sign in to do that.', 401) });
const ok = () => jsonResponse({ user: USER });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session check on startup', () => {
  it('shows a loading state while the session is checked', async () => {
    stubApi({ 'GET /api/auth/me': () => new Promise<Response>(() => undefined) });
    renderApp('/tasks');
    expect(await screen.findByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('loads the signed-in user and shows the requested page', async () => {
    stubApi();
    await renderSignedIn('/tasks');
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
  });

  it('explains when the server cannot be reached and recovers on retry', async () => {
    let attempts = 0;
    stubApi({
      'GET /api/auth/me': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return ok();
      },
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('main')).toBeInTheDocument();
  });
});

describe('protected routes', () => {
  it('redirects a signed-out visitor to the login page and returns them after signing in', async () => {
    const api = stubApi({
      ...signedOut(),
      'POST /api/auth/login': () => ok(),
    });
    renderApp('/tasks');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/login')).toHaveLength(1);
  });

  it('keeps the query string of the original destination', async () => {
    stubApi({ ...signedOut(), 'POST /api/auth/login': () => ok() });
    renderApp('/quiz?topic=math');
    await screen.findByRole('heading', { name: 'Sign in' });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Quiz' })).toBeInTheDocument();
  });

  it('sends a signed-in user away from the login and register pages', async () => {
    stubApi();
    renderApp('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('does not render protected content for a signed-out visitor', async () => {
    stubApi(signedOut());
    renderApp('/settings');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

describe('login form', () => {
  const open = async (overrides = {}) => {
    const api = stubApi({ ...signedOut(), ...overrides });
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    return api;
  };

  it('shows inline messages for empty fields without calling the server', async () => {
    const api = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(api.callsTo('POST /api/auth/login')).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    const api = await open();
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/login')).toHaveLength(0);
  });

  it('sends the CSRF header and trimmed credentials', async () => {
    const api = await open({ 'POST /api/auth/login': () => ok() });
    await userEvent.type(screen.getByLabelText('Email'), '  ada@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('main');
    const [call] = api.callsTo('POST /api/auth/login');
    expect(call?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(call?.body).toEqual({ email: 'ada@example.com', password: 'correct horse battery' });
  });

  it('shows a clear message for wrong credentials and keeps the form usable', async () => {
    await open({ 'POST /api/auth/login': () => errorResponse('INVALID_CREDENTIALS', 'Incorrect email or password.', 401) });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password. Check them and try again.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('tells the user how long to wait when rate limited', async () => {
    await open({ 'POST /api/auth/login': () => errorResponse('RATE_LIMITED', 'Too many.', 429, { retryAfterSeconds: 600 }) });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 10 minutes and try again.');
  });

  it('suggests retrying when the server cannot be reached', async () => {
    await open({
      'POST /api/auth/login': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
  });

  it('disables the button while signing in and sends one request for repeated submits', async () => {
    let release: (response: Response) => void = () => undefined;
    const api = await open({ 'POST /api/auth/login': () => new Promise<Response>((resolve) => (release = resolve)) });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    const button = screen.getByRole('button', { name: 'Sign in' });
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Password'), '{Enter}{Enter}');
    expect(api.callsTo('POST /api/auth/login')).toHaveLength(1);
    release(ok());
    await screen.findByRole('main');
  });

  it('links to registration', async () => {
    await open();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });
});

describe('register form', () => {
  const open = async (overrides = {}) => {
    const api = stubApi({ ...signedOut(), ...overrides });
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create your account' });
    return api;
  };
  const accept = () => userEvent.click(screen.getByRole('checkbox', { name: /I accept the/ }));

  it('explains the password rule up front and rejects short passwords without calling the server', async () => {
    const api = await open();
    expect(screen.getByText('At least 10 characters.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/At least 10 characters\..*Use at least 10 characters\./);
    expect(api.callsTo('POST /api/auth/register')).toHaveLength(0);
  });

  it('creates the account and lands on the dashboard', async () => {
    const api = await open({ 'POST /api/auth/register': () => jsonResponse({ user: USER }, 201) });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await accept();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/register')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(api.callsTo('POST /api/auth/register')[0]?.body).toEqual({ email: 'ada@example.com', password: 'correct horse battery', acceptTerms: true });
  });

  it('asks for acceptance of the Terms and the Privacy Policy, with links to both', async () => {
    await open();
    const box = screen.getByRole('checkbox', { name: /I accept the Terms of Service and the Privacy Policy/ });
    expect(box).not.toBeChecked();
    const label = within(box.closest('label') as HTMLElement);
    expect(label.getByRole('link', { name: /Terms of Service/ })).toHaveAttribute('href', '/terms');
    expect(label.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute('href', '/privacy');
    expect(label.getByRole('link', { name: /Terms of Service/ })).toHaveAttribute('target', '_blank');
    expect(label.getByRole('link', { name: /Terms of Service/ })).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const footer = within(screen.getByRole('navigation', { name: 'Legal' }));
    expect(footer.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(footer.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  it('does not create an account until the terms are accepted, and says why', async () => {
    const api = await open({ 'POST /api/auth/register': () => jsonResponse({ user: USER }, 201) });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const box = screen.getByRole('checkbox', { name: /I accept the/ });
    expect(screen.getByText('Accept the Terms of Service and the Privacy Policy to create an account.')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Accept the Terms of Service and the Privacy Policy to create an account.');
    expect(box).toHaveFocus();
    expect(api.callsTo('POST /api/auth/register')).toHaveLength(0);

    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/register')).toHaveLength(1);
  });

  it('shows the server\'s refusal of the terms next to the checkbox', async () => {
    await open({
      'POST /api/auth/register': () => errorResponse('VALIDATION_ERROR', 'The request is invalid.', 400, { fields: [{ path: 'acceptTerms', message: 'Accept the Terms first.' }] }),
    });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await accept();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Accept the Terms first.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I accept the/ })).toHaveFocus();
  });

  it('shows a duplicate email against the email field with a way forward', async () => {
    await open({ 'POST /api/auth/register': () => errorResponse('EMAIL_TAKEN', 'taken', 409) });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await accept();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/already exists\. Try signing in instead/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('maps server validation errors onto the matching fields', async () => {
    await open({
      'POST /api/auth/register': () =>
        errorResponse('VALIDATION_ERROR', 'The request is invalid.', 400, { fields: [{ path: 'password', message: 'Too weak for the server.' }] }),
    });
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await accept();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Too weak for the server.')).toBeInTheDocument();
  });

  it('links back to sign in', async () => {
    await open();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});

describe('sign out and expiry', () => {
  it('shows the signed-in user in the header', async () => {
    stubApi();
    await renderSignedIn();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('calls the logout endpoint with the CSRF header and ends on the login page', async () => {
    const api = stubApi();
    await renderSignedIn();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in' });
    const [call] = api.callsTo('POST /api/auth/logout');
    expect(call?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument();
  });

  it('stays signed in and explains when signing out fails', async () => {
    stubApi({
      'POST /api/auth/logout': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await renderSignedIn();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not sign out/);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('returns to the login page with an explanation when a later request reports the session ended', async () => {
    stubApi({ 'GET /api/health': () => errorResponse('UNAUTHENTICATED', 'You need to sign in to do that.', 401) });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired. Please sign in again.');
  });

  it('does not show the expiry notice to someone who was never signed in', async () => {
    stubApi(signedOut());
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument();
  });
});

describe('form helpers', () => {
  it('validates emails and passwords', () => {
    expect(validateEmail('')).toMatch(/Enter your email/);
    expect(validateEmail('a@b')).toMatch(/valid email/);
    expect(validateEmail(' a@b.co ')).toBeUndefined();
    expect(validateNewPassword('')).toMatch(/Enter a password/);
    expect(validateNewPassword('123456789')).toMatch(/at least 10/);
    expect(validateNewPassword('x'.repeat(129))).toMatch(/at most 128/);
    expect(validateNewPassword('x'.repeat(10))).toBeUndefined();
    expect(validateExistingPassword('')).toMatch(/Enter your password/);
    expect(validateExistingPassword('a')).toBeUndefined();
  });

  it('describes API failures for the user', () => {
    expect(describeAuthError(new NetworkError()).form).toMatch(/Cannot reach/);
    expect(describeAuthError(new Error('boom')).form).toMatch(/Something went wrong/);
    expect(describeAuthError(new ApiError(401, 'INVALID_CREDENTIALS', 'x')).form).toMatch(/Incorrect email or password/);
    expect(describeAuthError(new ApiError(429, 'RATE_LIMITED', 'Server text')).form).toBe('Server text');
    expect(describeAuthError(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 30 })).form).toMatch(/Wait 1 minute and/);
    expect(describeAuthError(new ApiError(400, 'VALIDATION_ERROR', 'Bad', { fields: [{ path: 'other', message: 'm' }] })).form).toBe('Bad');
    expect(describeAuthError(new ApiError(400, 'VALIDATION_ERROR', 'Bad')).form).toBe('Bad');
    expect(describeAuthError(new ApiError(500, 'INTERNAL_ERROR', 'Server broke')).form).toBe('Server broke');
    expect(describeAuthError(new ApiError(500, 'INTERNAL_ERROR', '')).form).toMatch(/Something went wrong/);
  });

  it('accepts only in-app destinations', () => {
    expect(destinationFrom({ from: '/tasks?x=1' })).toBe('/tasks?x=1');
    expect(destinationFrom({ from: '//evil.example' })).toBe('/');
    expect(destinationFrom({ from: 'https://evil.example' })).toBe('/');
    expect(destinationFrom({ from: 42 })).toBe('/');
    expect(destinationFrom(null)).toBe('/');
    expect(destinationFrom(undefined)).toBe('/');
  });
});

describe('theme control on auth pages', () => {
  it('is available before signing in', async () => {
    stubApi(signedOut());
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});
