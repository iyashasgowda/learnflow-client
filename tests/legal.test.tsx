import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeMaterial, materialList } from './fakeXhr';
import { errorResponse, jsonResponse, renderApp, renderSignedIn, stubApi, USER } from './testUtils';

const signedOut = () => ({ 'GET /api/auth/me': () => errorResponse('UNAUTHENTICATED', 'You need to sign in to do that.', 401) });
const unacknowledged = { ...USER, aiDisclosureAcknowledged: false };
const meWith = (user: typeof USER) => ({ 'GET /api/auth/me': () => jsonResponse({ user }) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Terms and Privacy pages', () => {
  it('open without signing in, and link back to sign in', async () => {
    stubApi(signedOut());
    renderApp('/terms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    expect(document.title).toBe('Terms of Service · LearnFlow');
  });

  it('state that chat messages and document text are sent to a third-party AI provider', async () => {
    stubApi(signedOut());
    renderApp('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText(/Chat messages and document text are sent to a third-party AI provider/)).toBeInTheDocument();
  });

  it('describe what is stored, what is discarded, and how to delete the account', async () => {
    stubApi(signedOut());
    renderApp('/privacy');
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' });
    expect(screen.getByRole('heading', { level: 2, name: 'What we store' })).toBeInTheDocument();
    expect(screen.getByText('Uploaded files are not kept.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What is kept and what is discarded' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Deleting your data' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('link to each other and from the footer', async () => {
    stubApi(signedOut());
    renderApp('/terms');
    await screen.findByRole('heading', { level: 1, name: 'Terms of Service' });
    const article = within(screen.getByRole('article'));
    expect(article.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Legal' })).getByRole('link', { name: 'Privacy Policy' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('offer a way back into the app when someone is signed in', async () => {
    stubApi();
    await renderSignedIn('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to LearnFlow' })).toHaveAttribute('href', '/');
  });

  it('are linked from the footer on the sign-in page and inside the app', async () => {
    stubApi(signedOut());
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(within(screen.getByRole('navigation', { name: 'Legal' })).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });

  it('are linked from the footer inside the app', async () => {
    stubApi();
    await renderSignedIn('/tasks');
    const footer = within(screen.getByRole('navigation', { name: 'Legal' }));
    expect(footer.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(footer.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});

describe('AI disclosure before the first AI request', () => {
  const conversation = { id: 'c-1', title: 'Biology', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', messageCount: 0 };

  const chatRoutes = {
    'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: true } }),
    'GET /api/conversations': () => jsonResponse({ items: [conversation] }),
    'GET /api/conversations/c-1/messages': () => jsonResponse({ items: [] }),
  };

  it('is shown in place of the chat box, with a link to the Privacy Policy, and nothing is sent', async () => {
    const api = stubApi({ ...meWith(unacknowledged), ...chatRoutes });
    await renderSignedIn('/assistant');
    const notice = await screen.findByRole('region', { name: 'Before you use the AI features' });
    expect(notice).toHaveTextContent(/your chat messages, the text of the documents you summarize/);
    expect(within(notice).getByRole('link', { name: /Read how your data is handled in the Privacy Policy/ })).toHaveAttribute('href', '/privacy');
    expect(screen.queryByRole('textbox', { name: /message/i })).not.toBeInTheDocument();
    expect(api.callsTo('POST /api/conversations/c-1/messages')).toHaveLength(0);
  });

  it('is acknowledged once, saved to the account, and then the chat box appears', async () => {
    const api = stubApi({
      ...meWith(unacknowledged),
      ...chatRoutes,
      'POST /api/account/ai-disclosure': () => new Response(null, { status: 204 }),
    });
    await renderSignedIn('/assistant');
    await userEvent.click(await screen.findByRole('button', { name: 'I understand, continue' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Before you use the AI features' })).not.toBeInTheDocument());
    expect(api.callsTo('POST /api/account/ai-disclosure')).toHaveLength(1);
    expect(api.callsTo('POST /api/account/ai-disclosure')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('is not shown again to an account that has already acknowledged it', async () => {
    stubApi({ ...meWith(USER), ...chatRoutes });
    await renderSignedIn('/assistant');
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Before you use the AI features' })).not.toBeInTheDocument();
  });

  it('keeps the notice and explains when saving the acknowledgement fails', async () => {
    stubApi({
      ...meWith(unacknowledged),
      ...chatRoutes,
      'POST /api/account/ai-disclosure': () => errorResponse('INTERNAL_ERROR', 'Could not save that.', 500),
    });
    await renderSignedIn('/assistant');
    await userEvent.click(await screen.findByRole('button', { name: 'I understand, continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that.');
    expect(screen.getByRole('region', { name: 'Before you use the AI features' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I understand, continue' })).toBeEnabled();
  });

  it('is shown in place of the quiz form', async () => {
    stubApi({ ...meWith(unacknowledged), 'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: true } }) });
    await renderSignedIn('/quiz');
    expect(await screen.findByRole('region', { name: 'Before you use the AI features' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Make quiz|Create quiz|Generate quiz/ })).not.toBeInTheDocument();
  });

  it('is shown in place of the summary button', async () => {
    const material = makeMaterial({ id: 'm-1', name: 'biology.txt' });
    stubApi({
      ...meWith(unacknowledged),
      'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: true } }),
      'GET /api/materials': () => jsonResponse(materialList([material])),
      'GET /api/materials/m-1/summary': () => jsonResponse({ materialId: 'm-1', text: 'A summary.', model: 'm', sections: 1, truncated: false, createdAt: '2030-01-01T00:00:00.000Z' }),
    });
    await renderSignedIn('/materials');
    await screen.findByText('biology.txt');
    const toggle = screen.queryByRole('button', { name: /Summary|Summarize/ });
    if (toggle) await userEvent.click(toggle);
    expect(await screen.findByRole('region', { name: 'Before you use the AI features' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate summary|Regenerate summary/ })).not.toBeInTheDocument();
  });
});
