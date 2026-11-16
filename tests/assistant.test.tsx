import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Conversation } from '../src/api/chat';
import { errorResponse, jsonResponse, renderSignedIn, SETTINGS, stubApi, USER, type RecordedRequest, type RouteHandler } from './testUtils';
import { formatDateTime } from '../src/time/zone';

const user = userEvent.setup();
const AT = '2030-06-15T12:00:00.000Z';

const conv = (id: string, title: string): Conversation => ({ id, title, createdAt: AT, updatedAt: AT });
const msg = (id: string, role: 'user' | 'assistant', content: string, idempotencyKey: string | null = null): ChatMessage => ({ id, role, content, idempotencyKey, createdAt: AT });

interface Options {
  conversations?: Conversation[];
  messages?: Record<string, ChatMessage[]>;
  configured?: boolean;
  send?: (request: RecordedRequest, state: State) => Response | Promise<Response>;
  overrides?: Record<string, RouteHandler>;
}

interface State {
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  nextMessage: number;
}

// An in-memory stand-in for the chat API with the same shapes as the server.
function chatApi(options: Options = {}) {
  const state: State = { conversations: [...(options.conversations ?? [conv('c1', 'Biology')])], messages: { ...options.messages }, nextMessage: 1 };

  const answer = (request: RecordedRequest, id: string): Response => {
    const { content, idempotencyKey } = request.body as { content: string; idempotencyKey: string };
    // Like the real server: a message with a known key is stored once, and only gets its reply.
    const known = (state.messages[id] ?? []).find((message) => message.idempotencyKey === idempotencyKey);
    const userMessage = known ?? msg(`m${state.nextMessage++}`, 'user', content, idempotencyKey);
    const assistantMessage = msg(`m${state.nextMessage++}`, 'assistant', `Reply to: ${userMessage.content}`);
    state.messages[id] = [...(state.messages[id] ?? []).filter((message) => message !== known), userMessage, assistantMessage];
    return jsonResponse({ userMessage, assistantMessage }, 201);
  };

  const routes: Record<string, RouteHandler> = {
    'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: options.configured ?? true } }),
    'GET /api/conversations': () => jsonResponse({ items: state.conversations }),
    'POST /api/conversations': () => {
      const created = conv(`c${state.conversations.length + 1}`, 'New conversation');
      state.conversations.unshift(created);
      return jsonResponse(created, 201);
    },
  };
  for (const id of ['c1', 'c2', 'c3']) {
    routes[`GET /api/conversations/${id}/messages`] = () => jsonResponse({ items: state.messages[id] ?? [] });
    routes[`DELETE /api/conversations/${id}/messages`] = () => {
      state.messages[id] = [];
      return new Response(null, { status: 204 });
    };
    routes[`PATCH /api/conversations/${id}`] = (request) => {
      const found = state.conversations.find((item) => item.id === id)!;
      found.title = (request.body as { title: string }).title;
      return jsonResponse(found);
    };
    routes[`DELETE /api/conversations/${id}`] = () => {
      state.conversations = state.conversations.filter((item) => item.id !== id);
      return new Response(null, { status: 204 });
    };
    routes[`POST /api/conversations/${id}/messages`] = (request) => (options.send ? options.send(request, state) : answer(request, id));
  }
  const api = stubApi({ ...routes, ...options.overrides });
  return { api, state, answer };
}

const textbox = () => screen.getByRole('textbox', { name: 'Message' });
const sends = (api: ReturnType<typeof chatApi>['api'], id = 'c1') => api.callsTo(`POST /api/conversations/${id}/messages`);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conversation list', () => {
  it('shows an empty state and starts a conversation that becomes the selected one', async () => {
    const { api } = chatApi({ conversations: [] });
    await renderSignedIn('/assistant');
    expect(await screen.findByText(/No conversations yet/)).toBeInTheDocument();
    expect(screen.getByText('Start a conversation to ask your first question.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(api.callsTo('POST /api/conversations')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(screen.getByRole('button', { name: 'New conversation', current: true })).toBeInTheDocument();
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });

  it('selects the most recent conversation, shows its messages, and switches on click', async () => {
    chatApi({
      conversations: [conv('c2', 'Chemistry'), conv('c1', 'Biology')],
      messages: { c2: [msg('m1', 'user', 'What is a mole?', 'key-1'), msg('m2', 'assistant', 'A unit of amount.')], c1: [msg('m3', 'user', 'Define cell', 'key-2'), msg('m4', 'assistant', 'The unit of life.')] },
    });
    await renderSignedIn('/assistant');
    expect(await screen.findByText('What is a mole?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chemistry' })).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'Biology' }));
    expect(await screen.findByText('The unit of life.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Biology' })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText('What is a mole?')).not.toBeInTheDocument();
  });

  it('renames a conversation, and can be cancelled', async () => {
    const { api, state } = chatApi();
    await renderSignedIn('/assistant');
    await user.click(await screen.findByRole('button', { name: 'Rename: Biology' }));
    const input = screen.getByLabelText('New title');
    expect(input).toHaveValue('Biology');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename: Biology' }));
    await user.clear(screen.getByLabelText('New title'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('New title'), 'Cell biology');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Cell biology' })).toBeInTheDocument();
    expect(api.callsTo('PATCH /api/conversations/c1')[0]?.body).toEqual({ title: 'Cell biology' });
    expect(state.conversations[0]?.title).toBe('Cell biology');
  });

  it('keeps the rename form open with a message when renaming fails', async () => {
    chatApi({ overrides: { 'PATCH /api/conversations/c1': () => errorResponse('INTERNAL_ERROR', 'Could not rename.', 500) } });
    await renderSignedIn('/assistant');
    await user.click(await screen.findByRole('button', { name: 'Rename: Biology' }));
    await user.type(screen.getByLabelText('New title'), ' 101');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not rename.');
    expect(screen.getByLabelText('New title')).toBeInTheDocument();
  });

  it('asks before clearing, then clears the messages but keeps the conversation', async () => {
    const { api } = chatApi({ messages: { c1: [msg('m1', 'user', 'hello', 'key-1'), msg('m2', 'assistant', 'hi there')] } });
    await renderSignedIn('/assistant');
    await screen.findByText('hi there');
    await user.click(screen.getByRole('button', { name: 'Clear: Biology' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear this conversation?' });
    expect(within(dialog).getByText(/The conversation stays/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.callsTo('DELETE /api/conversations/c1/messages')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Clear: Biology' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear messages' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/No messages yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Biology' })).toBeInTheDocument();
  });

  it('asks before deleting, then removes the conversation and falls back to the next one', async () => {
    chatApi({ conversations: [conv('c2', 'Chemistry'), conv('c1', 'Biology')] });
    await renderSignedIn('/assistant');
    await user.click(await screen.findByRole('button', { name: 'Delete: Chemistry' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this conversation?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete conversation' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chemistry' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Biology' })).toHaveAttribute('aria-current', 'true');
  });

  it('shows an error and keeps the dialog open when a delete fails', async () => {
    chatApi({ overrides: { 'DELETE /api/conversations/c1': () => errorResponse('INTERNAL_ERROR', 'Could not delete.', 500) } });
    await renderSignedIn('/assistant');
    await user.click(await screen.findByRole('button', { name: 'Delete: Biology' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete conversation' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Could not delete.');
  });

  it('shows loading and an error with retry for the list', async () => {
    let fail = true;
    const { state } = chatApi({ overrides: {} });
    stubApi({
      'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: true } }),
      'GET /api/conversations': () => (fail ? errorResponse('INTERNAL_ERROR', 'Could not load conversations.', 500) : jsonResponse({ items: state.conversations })),
      'GET /api/conversations/c1/messages': () => jsonResponse({ items: [] }),
    });
    await renderSignedIn('/assistant');
    expect(await screen.findByText('Could not load conversations.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Biology' })).toBeInTheDocument();
  });

  it('shows an error with retry when the messages cannot be loaded', async () => {
    let fail = true;
    chatApi({ overrides: { 'GET /api/conversations/c1/messages': () => (fail ? errorResponse('INTERNAL_ERROR', 'Could not load messages.', 500) : jsonResponse({ items: [msg('m1', 'assistant', 'Loaded')] })) } });
    await renderSignedIn('/assistant');
    expect(await screen.findByText('Could not load messages.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Loaded')).toBeInTheDocument();
  });

  it('shows a problem when a new conversation cannot be created', async () => {
    chatApi({ overrides: { 'POST /api/conversations': () => errorResponse('INTERNAL_ERROR', 'Could not start one.', 500) } });
    await renderSignedIn('/assistant');
    await user.click(await screen.findByRole('button', { name: 'New conversation' }));
    expect(await screen.findByText('Could not start one.')).toBeInTheDocument();
  });
});

describe('sending messages', () => {
  it('sends on Enter with a trimmed message and a fresh key, shows the reply, and clears the box', async () => {
    const { api } = chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), '  What is osmosis?  {Enter}');

    expect(await screen.findByText('Reply to: What is osmosis?')).toBeInTheDocument();
    expect(textbox()).toHaveValue('');
    const [call] = sends(api);
    expect(call?.body).toMatchObject({ content: 'What is osmosis?' });
    expect((call?.body as { idempotencyKey: string }).idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(call?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(screen.getByText('What is osmosis?')).toBeInTheDocument();
  });

  it('uses a different key for each message', async () => {
    const { api } = chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'one{Enter}');
    await screen.findByText('Reply to: one');
    await user.type(textbox(), 'two{Enter}');
    await screen.findByText('Reply to: two');
    const keys = sends(api).map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('inserts a new line on Shift+Enter without sending', async () => {
    const { api } = chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(textbox()).toHaveValue('line one\nline two');
    expect(sends(api)).toHaveLength(0);
    await user.keyboard('{Enter}');
    await screen.findByText(/Reply to: line one/);
    expect((sends(api)[0]?.body as { content: string }).content).toBe('line one\nline two');
  });

  it('does not send while an input method is composing text', async () => {
    const { api } = chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'にほん');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    textbox().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(sends(api)).toHaveLength(0);
  });

  it('disables Send for empty and whitespace-only text, and ignores Enter on them', async () => {
    const { api } = chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(textbox(), '   {Enter}');
    expect(sends(api)).toHaveLength(0);
    await user.type(textbox(), 'real');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('sends with the Send button too', async () => {
    chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'by button');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Reply to: by button')).toBeInTheDocument();
  });

  it('shows a loading indicator, blocks a second send while one is running, and sends only one request', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { api } = chatApi({
      send: async (request, state) => {
        await gate;
        const { content, idempotencyKey } = request.body as { content: string; idempotencyKey: string };
        const userMessage = msg('m1', 'user', content, idempotencyKey);
        const assistantMessage = msg('m2', 'assistant', 'Finally');
        state.messages.c1 = [userMessage, assistantMessage];
        return jsonResponse({ userMessage, assistantMessage }, 201);
      },
    });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'slow question{Enter}');

    expect(await screen.findByText('Assistant is writing…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByText('slow question')).toBeInTheDocument();
    await user.type(textbox(), 'impatient{Enter}');
    await user.type(textbox(), '{Enter}');
    expect(sends(api)).toHaveLength(1);

    release();
    expect(await screen.findByText('Finally')).toBeInTheDocument();
    expect(screen.queryByText('Assistant is writing…')).not.toBeInTheDocument();
    expect(screen.getAllByText('slow question')).toHaveLength(1);
  });

  it('limits the message length and shows a counter near the limit', async () => {
    chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    expect(textbox()).toHaveAttribute('maxlength', '4000');
    await user.click(textbox());
    await user.paste('x'.repeat(3600));
    expect(screen.getByText('3600 / 4000')).toBeInTheDocument();
    await user.paste('y'.repeat(1000));
    expect((textbox() as HTMLTextAreaElement).value).toHaveLength(4000);
  });

  it('scrolls to the latest message', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    chatApi();
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'hello{Enter}');
    await screen.findByText('Reply to: hello');
    expect(scroll).toHaveBeenCalledWith({ block: 'end' });
    expect(scroll.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps the loading state with the conversation it belongs to', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    chatApi({
      conversations: [conv('c2', 'Chemistry'), conv('c1', 'Biology')],
      send: async (request, state) => {
        await gate;
        const { content, idempotencyKey } = request.body as { content: string; idempotencyKey: string };
        const userMessage = msg('m1', 'user', content, idempotencyKey);
        const assistantMessage = msg('m2', 'assistant', 'Done');
        state.messages.c2 = [userMessage, assistantMessage];
        return jsonResponse({ userMessage, assistantMessage }, 201);
      },
    });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'question{Enter}');
    await screen.findByText('Assistant is writing…');
    await user.click(screen.getByRole('button', { name: 'Biology' }));
    expect(screen.queryByText('Assistant is writing…')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Chemistry' }));
    expect(screen.getByText('Assistant is writing…')).toBeInTheDocument();
    release();
    expect(await screen.findByText('Done')).toBeInTheDocument();
  });
});

describe('when a send fails', () => {
  it('shows the error with Retry, and Retry sends the same key without duplicating the message', async () => {
    let fail = true;
    const { api, answer } = chatApi({
      send: (request, state) => {
        if (!fail) return answer(request, 'c1');
        // The server stores the message before the provider fails.
        const { content, idempotencyKey } = request.body as { content: string; idempotencyKey: string };
        state.messages.c1 = [msg('m1', 'user', content, idempotencyKey)];
        return errorResponse('AI_TIMEOUT', 'The AI service took too long to answer. Please try again.', 504);
      },
    });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'will time out{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The assistant could not reply.');
    expect(alert).toHaveTextContent('took too long to answer');
    // The stored copy replaces the local one, so the message is never shown twice.
    await waitFor(() => expect(screen.getAllByText('will time out')).toHaveLength(1));

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Reply to: will time out')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const [first, second] = sends(api);
    expect((second?.body as { idempotencyKey: string }).idempotencyKey).toBe((first?.body as { idempotencyKey: string }).idempotencyKey);
    expect(screen.getAllByText('will time out')).toHaveLength(1);
  });

  it('keeps a message that never reached the server visible as failed, and Retry sends it with the same key', async () => {
    let offline = true;
    const { api, answer } = chatApi({
      send: (request) => {
        if (offline) throw new TypeError('Failed to fetch');
        return answer(request, 'c1');
      },
    });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'lost in transit{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    expect(screen.getByText('lost in transit')).toBeInTheDocument();

    offline = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Reply to: lost in transit')).toBeInTheDocument();
    const keys = sends(api).map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(screen.getAllByText('lost in transit')).toHaveLength(1);
  });

  it('offers no Retry when sending again cannot help, and lets the user dismiss the message', async () => {
    chatApi({ send: () => errorResponse('CONVERSATION_FULL', 'This conversation is full. Start a new conversation to keep going.', 409) });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'one more{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Start a new conversation');
    expect(within(alert).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('one more')).not.toBeInTheDocument();
  });

  it('offers Retry for a message that was stored but never answered, after a reload', async () => {
    const { api, answer } = chatApi({
      messages: { c1: [msg('m1', 'user', 'unanswered question', 'saved-key-0001')] },
      send: (request) => answer(request, 'c1'),
    });
    await renderSignedIn('/assistant');
    expect(await screen.findByText('This message has no reply yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Reply to: unanswered question')).toBeInTheDocument();
    expect(sends(api)[0]?.body).toEqual({ content: 'unanswered question', idempotencyKey: 'saved-key-0001' });
  });

  it('shows a general message for an unexpected failure', async () => {
    chatApi({ send: () => new Response('<html>oops</html>', { status: 502 }) });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('The server sent an unexpected response');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('banners and disabled states', () => {
  it('explains that the assistant is not configured, disables sending, and keeps conversations available', async () => {
    chatApi({ configured: false, conversations: [conv('c1', 'Biology')], messages: { c1: [msg('m1', 'user', 'old question', 'k-1'), msg('m2', 'assistant', 'old answer')] } });
    await renderSignedIn('/assistant');
    expect(await screen.findByText(/not set up on this server yet/)).toBeInTheDocument();
    expect(await screen.findByText('old answer')).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText('The assistant is not available on this server.')).toBeInTheDocument();
  });

  it('learns that AI is not configured from the server\'s answer', async () => {
    chatApi({ send: () => errorResponse('AI_NOT_CONFIGURED', 'The AI assistant is not set up on this server yet.', 503) });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'hello{Enter}');
    expect(await screen.findAllByText(/not set up on this server yet/)).not.toHaveLength(0);
    await waitFor(() => expect(textbox()).toBeDisabled());
  });

  it('asks an unverified user to verify, still lists conversations, and does not allow sending', async () => {
    chatApi();
    stubApi({
      'GET /api/auth/me': () => jsonResponse({ user: { ...USER, emailVerified: false } }),
      'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: true } }),
      'GET /api/conversations': () => jsonResponse({ items: [conv('c1', 'Biology')] }),
      'GET /api/conversations/c1/messages': () => jsonResponse({ items: [] }),
    });
    await renderSignedIn('/assistant');
    expect(await screen.findByRole('button', { name: 'Biology' })).toBeInTheDocument();
    expect(screen.getAllByText(/Verify your email address to use the assistant/).length).toBeGreaterThan(0);
    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows the quota message with the reset time, disables sending, and keeps the conversation visible', async () => {
    const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    chatApi({
      messages: { c1: [msg('m1', 'user', 'earlier', 'k-0'), msg('m2', 'assistant', 'earlier answer')] },
      send: () => errorResponse('AI_QUOTA_EXCEEDED', 'You have used your AI requests for today. They reset at midnight UTC.', 429, { resetsAt }),
    });
    await renderSignedIn('/assistant');
    await screen.findByText('earlier answer');
    await user.type(textbox(), 'one too many{Enter}');
    expect((await screen.findAllByText(/You have used your AI requests for today\. They reset at/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(formatDateTime(resetsAt, SETTINGS.timeZone).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThan(0);
    await waitFor(() => expect(textbox()).toBeDisabled());
    expect(screen.getByText('earlier answer')).toBeInTheDocument();
    expect(within(screen.getByRole('log')).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows the budget-paused message', async () => {
    chatApi({ send: () => errorResponse('AI_BUDGET_PAUSED', 'AI features are paused for today. Please try again tomorrow.', 503) });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'hello{Enter}');
    expect(await screen.findByText(/paused for today because the shared daily budget/)).toBeInTheDocument();
    await waitFor(() => expect(textbox()).toBeDisabled());
  });

  it('clears the banner after a later send succeeds', async () => {
    let paused = true;
    const { answer } = chatApi({
      send: (request) => (paused ? errorResponse('AI_BUDGET_PAUSED', 'Paused.', 503) : answer(request, 'c1')),
    });
    await renderSignedIn('/assistant');
    await screen.findByRole('textbox', { name: 'Message' });
    await user.type(textbox(), 'first{Enter}');
    await screen.findByText(/paused for today because the shared daily budget/);
    paused = false;
    expect(textbox()).toBeDisabled();
  });
});

describe('safe rendering of replies', () => {
  const hostile = [
    '<script>window.__pwned = 1</script>',
    '<img src="x" onerror="window.__pwned = 2">',
    '<a href="javascript:window.__pwned = 3" onclick="window.__pwned = 4">raw link</a>',
    '[markdown link](javascript:window.__pwned = 5)',
    '![tracking pixel](https://tracker.example/pixel.png)',
    '<iframe src="https://evil.example"></iframe>',
    '',
    '**bold text** and `inline code`',
    '',
    '- item one',
    '- item two',
    '',
    '[safe link](https://example.com/page)',
  ].join('\n');

  it('never produces executable elements or handlers from the reply', async () => {
    chatApi({ messages: { c1: [msg('m1', 'user', 'show me', 'k-1'), msg('m2', 'assistant', hostile)] } });
    await renderSignedIn('/assistant');
    const log = await screen.findByRole('log');
    await screen.findByText('bold text');

    expect(log.querySelector('script')).toBeNull();
    expect(log.querySelector('iframe')).toBeNull();
    expect(log.querySelector('img')).toBeNull();
    expect(log.querySelector('[onerror], [onclick]')).toBeNull();
    for (const anchor of Array.from(log.querySelectorAll('a'))) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/^\s*javascript:/i);
    }
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('still renders Markdown formatting, and opens links safely', async () => {
    chatApi({ messages: { c1: [msg('m1', 'user', 'show me', 'k-1'), msg('m2', 'assistant', hostile)] } });
    await renderSignedIn('/assistant');
    const log = await screen.findByRole('log');
    expect(within(log).getByText('bold text').tagName).toBe('STRONG');
    expect(within(log).getByText('inline code').tagName).toBe('CODE');
    expect(within(log).getAllByRole('listitem').map((item) => item.textContent)).toEqual(expect.arrayContaining(['item one', 'item two']));
    const link = within(log).getByRole('link', { name: 'safe link' });
    expect(link).toHaveAttribute('href', 'https://example.com/page');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows what the user typed as plain text, not as Markdown or HTML', async () => {
    chatApi({ messages: { c1: [msg('m1', 'user', '<b>not bold</b> **nor this**', 'k-1'), msg('m2', 'assistant', 'ok')] } });
    await renderSignedIn('/assistant');
    const text = await screen.findByText('<b>not bold</b> **nor this**');
    expect(text.querySelector('b, strong')).toBeNull();
  });

  it('keeps the page itself unaffected by hostile conversation titles', async () => {
    chatApi({ conversations: [conv('c1', '<img src=x onerror="window.__pwned = 6"><b>title</b>')] });
    await renderSignedIn('/assistant');
    const button = await screen.findByRole('button', { current: true });
    expect(button.querySelector('img, b')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
