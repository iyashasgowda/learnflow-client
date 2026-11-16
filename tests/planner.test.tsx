import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMaterial, materialList } from './fakeXhr';
import { errorResponse, jsonResponse, makeTask, renderSignedIn, stubApi, taskList } from './testUtils';
import type { RecordedRequest, RouteHandler } from './testUtils';

const user = userEvent.setup();

// Wednesday 12 June 2030, 11:00 in New York. Only Date is faked, so timers and promises behave normally.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-06-12T15:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const session = (id: string, startsAt: string, endsAt: string, title = id, overrides: Record<string, unknown> = {}) => ({
  id,
  title,
  startsAt,
  endsAt,
  materialId: null,
  taskId: null,
  createdAt: '2030-06-01T00:00:00.000Z',
  updatedAt: '2030-06-01T00:00:00.000Z',
  ...overrides,
});

const NY = 'America/New_York';
const WEDNESDAY_9AM = session('s-1', '2030-06-12T13:00:00.000Z', '2030-06-12T14:30:00.000Z', 'Revise cells');

interface Options {
  items?: ReturnType<typeof session>[];
  zone?: string;
  weekStart?: 'monday' | 'sunday' | 'saturday';
  extra?: Record<string, RouteHandler>;
}

async function open(options: Options = {}) {
  const api = stubApi({
    'GET /api/settings': () => jsonResponse({ theme: 'system', timeZone: options.zone ?? NY, weekStart: options.weekStart ?? 'monday', saved: true }),
    'GET /api/sessions': () => jsonResponse({ items: options.items ?? [] }),
    'GET /api/materials': () => jsonResponse(materialList([makeMaterial({ id: 'm-1', name: 'biology.txt' }), makeMaterial({ id: 'm-2', name: 'broken.pdf', status: 'failed' })])),
    'GET /api/tasks': () => jsonResponse(taskList([makeTask({ id: 't-1', title: 'Read chapter 4' })])),
    ...options.extra,
  });
  await renderSignedIn('/planner');
  await screen.findByRole('heading', { level: 1, name: 'Study Planner' });
  return api;
}

const week = () => screen.getByRole('group', { name: 'Week view' });
const day = (name: string) => within(week()).getByRole('region', { name });
const dialog = () => screen.getByRole('dialog');
const change = (label: string | RegExp, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
const sessionRequests = (api: ReturnType<typeof stubApi>) => api.callsTo('GET /api/sessions');
const rangeOf = (request: RecordedRequest) => {
  const query = new URLSearchParams(request.path.split('?')[1]);
  return { from: query.get('from'), to: query.get('to'), limit: query.get('limit') };
};

describe('planner: the week', () => {
  it('shows the week of today, from Monday, and asks for exactly that range in the user\'s zone', async () => {
    const api = await open();
    expect(await screen.findByRole('heading', { level: 2, name: /Mon, Jun 10 – Sun, Jun 16/ })).toBeInTheDocument();
    expect(rangeOf(sessionRequests(api)[0] as RecordedRequest)).toEqual({ from: '2030-06-10T04:00:00.000Z', to: '2030-06-17T04:00:00.000Z', limit: '200' });
    expect(screen.getByText(/America\/New York/)).toBeInTheDocument();
  });

  it('starts the week on the day the user chose', async () => {
    const api = await open({ weekStart: 'sunday' });
    expect(await screen.findByRole('heading', { level: 2, name: /Sun, Jun 9 – Sat, Jun 15/ })).toBeInTheDocument();
    expect(rangeOf(sessionRequests(api)[0] as RecordedRequest).from).toBe('2030-06-09T04:00:00.000Z');
  });

  it('shows all seven days with today marked', async () => {
    await open({ items: [WEDNESDAY_9AM] });
    await screen.findByText('Revise cells');
    expect(within(week()).getAllByRole('region')).toHaveLength(7);
    expect(day('Wednesday, June 12, 2030')).toHaveTextContent('(today)');
    expect(day('Monday, June 10, 2030')).toHaveTextContent('Nothing planned');
  });

  it('shows a session on its day, at the time in the user\'s zone', async () => {
    await open({ items: [WEDNESDAY_9AM] });
    const wednesday = await screen.findByRole('region', { name: 'Wednesday, June 12, 2030' });
    expect(wednesday).toHaveTextContent('Revise cells');
    expect(wednesday).toHaveTextContent(/9:00\s?AM – 10:30\s?AM/);
  });

  it('shows the same session at another time, and on another day, in another zone', async () => {
    // 20:00 UTC on Wednesday is 4 PM in New York but already 5 AM on Thursday in Tokyo.
    const evening = session('s-1', '2030-06-12T20:00:00.000Z', '2030-06-12T21:00:00.000Z', 'Evening review');
    await open({ items: [evening], zone: 'Asia/Tokyo' });
    const thursday = await screen.findByRole('region', { name: 'Thursday, June 13, 2030' });
    expect(thursday).toHaveTextContent('Evening review');
    expect(thursday).toHaveTextContent(/5:00\s?AM – 6:00\s?AM/);
    expect(day('Wednesday, June 12, 2030')).not.toHaveTextContent('Evening review');
  });

  it('shows a session that crosses midnight with the day it ends', async () => {
    const late = session('s-1', '2030-06-13T03:00:00.000Z', '2030-06-13T05:00:00.000Z', 'Late night');
    await open({ items: [late] });
    const wednesday = await screen.findByRole('region', { name: 'Wednesday, June 12, 2030' });
    expect(wednesday).toHaveTextContent(/11:00\s?PM – 1:00\s?AM \(Thu, Jun 13\)/);
  });

  it('orders a day by start time, with a fixed order for ties, whatever order the server sends', async () => {
    const items = [
      session('s-d', '2030-06-12T16:00:00.000Z', '2030-06-12T17:00:00.000Z', 'Afternoon'),
      session('s-b', '2030-06-12T13:00:00.000Z', '2030-06-12T14:00:00.000Z', 'Tie B'),
      session('s-a', '2030-06-12T13:00:00.000Z', '2030-06-12T14:00:00.000Z', 'Tie A'),
      session('s-c', '2030-06-12T12:00:00.000Z', '2030-06-12T12:30:00.000Z', 'Early'),
    ];
    const frozen = Object.freeze([...items]) as typeof items;
    await open({ items: frozen });
    const wednesday = await screen.findByRole('region', { name: 'Wednesday, June 12, 2030' });
    const titles = within(wednesday).getAllByRole('listitem').map((item) => item.querySelector('.planner-title')?.textContent);
    expect(titles).toEqual(['Early', 'Tie A', 'Tie B', 'Afternoon']);
  });

  it('marks sessions that overlap, in words and not only by colour', async () => {
    const items = [
      session('s-1', '2030-06-12T13:00:00.000Z', '2030-06-12T15:00:00.000Z', 'First'),
      session('s-2', '2030-06-12T14:00:00.000Z', '2030-06-12T16:00:00.000Z', 'Second'),
      session('s-3', '2030-06-12T16:00:00.000Z', '2030-06-12T17:00:00.000Z', 'Touches second'),
    ];
    await open({ items });
    const wednesday = await screen.findByRole('region', { name: 'Wednesday, June 12, 2030' });
    const marked = within(wednesday).getAllByText('Overlaps another session');
    expect(marked).toHaveLength(2);
    const cards = within(wednesday).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('Overlaps another session');
    expect(cards[1]).toHaveTextContent('Overlaps another session');
    expect(cards[2]).not.toHaveTextContent('Overlaps');
  });

  it('shows both of two sessions at the same time', async () => {
    await open({ items: [session('s-1', '2030-06-12T13:00:00.000Z', '2030-06-12T14:00:00.000Z', 'One'), session('s-2', '2030-06-12T13:00:00.000Z', '2030-06-12T14:00:00.000Z', 'Two')] });
    expect(await screen.findByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });
});

describe('planner: empty and failing states', () => {
  it('offers to add a session when the week is empty', async () => {
    await open();
    expect(await screen.findByText('No study sessions this week.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Week view' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a session' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Add a study session');
  });

  it('shows an error with a retry when the sessions cannot be loaded', async () => {
    let fail = true;
    await open({ extra: { 'GET /api/sessions': () => (fail ? errorResponse('INTERNAL', 'Sessions are unavailable.', 500) : jsonResponse({ items: [WEDNESDAY_9AM] })) } });
    expect(await screen.findByText('Sessions are unavailable.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Revise cells')).toBeInTheDocument();
  });

  it('shows the agenda instead of the week on a phone-sized screen, with only the days that have sessions', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await open({ items: [WEDNESDAY_9AM, session('s-2', '2030-06-14T14:00:00.000Z', '2030-06-14T15:00:00.000Z', 'Friday study')] });
    const agenda = await screen.findByRole('group', { name: 'Agenda' });
    expect(screen.queryByRole('group', { name: 'Week view' })).not.toBeInTheDocument();
    const days = within(agenda).getAllByRole('region');
    expect(days.map((item) => item.getAttribute('aria-label'))).toEqual(['Wednesday, June 12, 2030', 'Friday, June 14, 2030']);
    expect(within(agenda).queryByText('Nothing planned')).not.toBeInTheDocument();
  });
});

describe('planner: moving between weeks', () => {
  it('asks for the next and previous week and returns to this one', async () => {
    const api = await open({ items: [WEDNESDAY_9AM] });
    await screen.findByText('Revise cells');
    expect(screen.getByRole('button', { name: 'This week' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(await screen.findByRole('heading', { level: 2, name: /Mon, Jun 17 – Sun, Jun 23/ })).toBeInTheDocument();
    expect(rangeOf(sessionRequests(api).at(-1) as RecordedRequest)).toMatchObject({ from: '2030-06-17T04:00:00.000Z', to: '2030-06-24T04:00:00.000Z' });
    expect(screen.getByRole('button', { name: 'This week' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByRole('heading', { level: 2, name: /Mon, Jun 3 – Sun, Jun 9/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'This week' }));
    expect(await screen.findByRole('heading', { level: 2, name: /Mon, Jun 10 – Sun, Jun 16/ })).toBeInTheDocument();
  });

  it('spans the daylight-saving change with real week boundaries', async () => {
    // The week of 4 March 2030 contains no change; the week of 4 March in the next request is checked for the 23-hour day.
    vi.setSystemTime(new Date('2030-03-12T15:00:00.000Z'));
    const api = await open();
    const { from, to } = rangeOf(sessionRequests(api)[0] as RecordedRequest);
    // Monday 11 March (after the change on the 10th) runs 04:00Z to 04:00Z the following Monday.
    expect(from).toBe('2030-03-11T04:00:00.000Z');
    expect(to).toBe('2030-03-18T04:00:00.000Z');
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    const previous = rangeOf(sessionRequests(api).at(-1) as RecordedRequest);
    // Monday 4 March was on winter time (05:00Z); the week is 7 days minus the skipped hour.
    expect(previous).toMatchObject({ from: '2030-03-04T05:00:00.000Z', to: '2030-03-11T04:00:00.000Z' });
  });
});

describe('planner: adding a session', () => {
  const openDialog = async (options: Options = {}) => {
    const api = await open(options);
    await user.click(await screen.findByRole('button', { name: 'Add session' }));
    await screen.findByRole('dialog');
    return api;
  };

  it('starts on today with a sensible hour and says which zone the times are in', async () => {
    await openDialog();
    expect(within(dialog()).getByLabelText('Start date')).toHaveValue('2030-06-12');
    expect(within(dialog()).getByLabelText('Start time')).toHaveValue('09:00');
    expect(within(dialog()).getByLabelText('End time')).toHaveValue('10:00');
    expect(dialog()).toHaveTextContent('America/New York');
    expect(dialog()).toHaveTextContent('at most 12 hours');
  });

  it('shows what is wrong next to each field and sends nothing', async () => {
    const api = await openDialog();
    change('End time', '08:00');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    expect(await within(dialog()).findByText('Enter a title.')).toBeInTheDocument();
    expect(within(dialog()).getByText('The end must be after the start.')).toBeInTheDocument();
    expect(api.callsTo('POST /api/sessions')).toHaveLength(0);
  });

  it('refuses a session longer than 12 hours', async () => {
    await openDialog();
    change('Title', 'Marathon');
    change('End time', '21:30');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    expect(await within(dialog()).findByText('A session can last at most 12 hours.')).toBeInTheDocument();
  });

  it('refuses incomplete or impossible dates and times', async () => {
    await openDialog();
    change('Title', 'Study');
    change('Start date', '');
    change('End time', '');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    expect(await within(dialog()).findByText('Enter a valid start date and time.')).toBeInTheDocument();
    expect(within(dialog()).getByText('Enter a valid end date and time.')).toBeInTheDocument();
  });

  it('refuses a time that does not exist because the clocks go forward', async () => {
    await openDialog();
    change('Title', 'Study');
    change('Start date', '2030-03-10');
    change('End date', '2030-03-10');
    change('Start time', '02:30');
    change('End time', '03:30');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    expect(await within(dialog()).findByText(/That start time does not exist on that date in your time zone/)).toBeInTheDocument();
  });

  it('sends the times as UTC instants of the user\'s zone, then shows the new session', async () => {
    const items: ReturnType<typeof session>[] = [];
    const api = await open({
      extra: {
        'POST /api/sessions': (request) => {
          const body = request.body as { title: string; startsAt: string; endsAt: string };
          items.push(session('s-new', body.startsAt, body.endsAt, body.title));
          return jsonResponse(items[0], 201);
        },
        'GET /api/sessions': () => jsonResponse({ items }),
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Add session' }));
    change('Title', '  Revise cells  ');
    change('Start time', '09:00');
    change('End time', '10:30');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.callsTo('POST /api/sessions')[0]?.body).toEqual({ title: 'Revise cells', startsAt: '2030-06-12T13:00:00.000Z', endsAt: '2030-06-12T14:30:00.000Z', materialId: null, taskId: null });
    expect(await screen.findByText('Session added.')).toBeInTheDocument();
    const wednesday = await screen.findByRole('region', { name: 'Wednesday, June 12, 2030' });
    expect(wednesday).toHaveTextContent('Revise cells');
  });

  it('links a ready material and a task', async () => {
    const api = await openDialog({ extra: { 'POST /api/sessions': () => jsonResponse(WEDNESDAY_9AM, 201) } });
    change('Title', 'Study');
    const material = within(dialog()).getByLabelText('Material (optional)');
    await waitFor(() => expect(within(material).getByRole('option', { name: 'biology.txt' })).toBeInTheDocument());
    expect(within(material).queryByRole('option', { name: 'broken.pdf' })).not.toBeInTheDocument();
    fireEvent.change(material, { target: { value: 'm-1' } });
    const task = within(dialog()).getByLabelText('Task (optional)');
    await waitFor(() => expect(within(task).getByRole('option', { name: 'Read chapter 4' })).toBeInTheDocument());
    fireEvent.change(task, { target: { value: 't-1' } });
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    await waitFor(() => expect(api.callsTo('POST /api/sessions')).toHaveLength(1));
    expect(api.callsTo('POST /api/sessions')[0]?.body).toMatchObject({ materialId: 'm-1', taskId: 't-1' });
  });

  it('puts a server error next to its field and keeps the dialog open', async () => {
    await openDialog({
      extra: { 'POST /api/sessions': () => errorResponse('VALIDATION_ERROR', 'The request is invalid.', 400, { fields: [{ path: 'endsAt', message: 'The end must be after the start.' }] }) },
    });
    change('Title', 'Study');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    expect(await within(dialog()).findByText('The end must be after the start.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a failure to save, and lets the user close the dialog without saving', async () => {
    await openDialog({ extra: { 'POST /api/sessions': () => errorResponse('INTERNAL', 'Could not save the session.', 500) } });
    change('Title', 'Study');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Could not save the session.');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('planner: editing and deleting', () => {
  it('opens a session in the user\'s zone and saves the new times', async () => {
    const api = await open({
      items: [WEDNESDAY_9AM],
      extra: { 'PATCH /api/sessions/s-1': () => jsonResponse({ ...WEDNESDAY_9AM, endsAt: '2030-06-12T15:00:00.000Z' }) },
    });
    await user.click(await screen.findByRole('button', { name: 'Edit: Revise cells' }));
    expect(dialog()).toHaveAccessibleName('Edit study session');
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Revise cells');
    expect(within(dialog()).getByLabelText('Start date')).toHaveValue('2030-06-12');
    expect(within(dialog()).getByLabelText('Start time')).toHaveValue('09:00');
    expect(within(dialog()).getByLabelText('End time')).toHaveValue('10:30');

    change('End time', '11:00');
    await user.click(within(dialog()).getByRole('button', { name: 'Save session' }));
    await waitFor(() => expect(api.callsTo('PATCH /api/sessions/s-1')).toHaveLength(1));
    expect(api.callsTo('PATCH /api/sessions/s-1')[0]?.body).toMatchObject({ title: 'Revise cells', startsAt: '2030-06-12T13:00:00.000Z', endsAt: '2030-06-12T15:00:00.000Z' });
    expect(await screen.findByText('Session updated.')).toBeInTheDocument();
  });

  it('asks before deleting, and keeps the session if the user cancels', async () => {
    const api = await open({ items: [WEDNESDAY_9AM] });
    await user.click(await screen.findByRole('button', { name: 'Delete: Revise cells' }));
    expect(dialog()).toHaveAccessibleName('Delete this session?');
    expect(dialog()).toHaveTextContent('Revise cells');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Revise cells')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/sessions/s-1')).toHaveLength(0);
  });

  it('deletes after confirmation and says so', async () => {
    let items = [WEDNESDAY_9AM];
    const api = await open({
      extra: {
        'GET /api/sessions': () => jsonResponse({ items }),
        'DELETE /api/sessions/s-1': () => {
          items = [];
          return new Response(null, { status: 204 });
        },
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Delete: Revise cells' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete session' }));
    expect(await screen.findByText('Session deleted.')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/sessions/s-1')).toHaveLength(1);
    expect(await screen.findByText('No study sessions this week.')).toBeInTheDocument();
  });

  it('shows why a deletion failed and keeps the session', async () => {
    await open({ items: [WEDNESDAY_9AM], extra: { 'DELETE /api/sessions/s-1': () => errorResponse('INTERNAL', 'Could not delete.', 500) } });
    await user.click(await screen.findByRole('button', { name: 'Delete: Revise cells' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete session' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Could not delete.');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Revise cells')).toBeInTheDocument();
  });
});
