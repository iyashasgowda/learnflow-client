import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyAnalytics, errorResponse, jsonResponse, renderSignedIn, stubApi, summary } from './testUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dashboard', () => {
  it('shows an empty state that links to tasks when there are no tasks', async () => {
    stubApi();
    await renderSignedIn('/');
    expect(await screen.findByText(/You have no tasks yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your first task' })).toHaveAttribute('href', '/tasks');
    expect(screen.queryByRole('list', { name: 'Task statistics' })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it('shows the counts from the server', async () => {
    stubApi({ 'GET /api/dashboard/summary': () => jsonResponse(summary({ total: 8, active: 5, completed: 3, overdue: 2, completionRate: 38 })) });
    await renderSignedIn('/');
    const stats = await screen.findByLabelText('Task statistics');
    const value = (name: string) => within(stats).getByText(name).nextElementSibling?.textContent;
    expect(value('Open tasks')).toBe('5');
    expect(value('Completed')).toBe('3');
    expect(value('Overdue')).toBe('2');
    expect(value('Completion rate')).toBe('38%');
    expect(screen.queryByText(/You have no tasks yet/)).not.toBeInTheDocument();
  });

  it('says plainly that sessions and quizzes have no data yet instead of inventing numbers', async () => {
    stubApi();
    await renderSignedIn('/');
    expect(await screen.findByText('No study sessions planned yet.')).toBeInTheDocument();
    expect(screen.getByText('No quizzes taken yet.')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    let fail = true;
    stubApi({
      'GET /api/dashboard/summary': () => (fail ? errorResponse('INTERNAL', 'Could not load the dashboard.', 500) : jsonResponse(summary({ total: 1, active: 1 }))),
    });
    await renderSignedIn('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the dashboard.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Task statistics')).toBeInTheDocument();
  });

  it('refreshes the counts after a task is added', async () => {
    let total = 0;
    stubApi({
      'GET /api/dashboard/summary': () => jsonResponse(summary({ total, active: total, completionRate: 0 })),
      'POST /api/tasks': () => {
        total = 1;
        return jsonResponse({ id: 'task-9' }, 201);
      },
    });
    await renderSignedIn('/tasks');
    await userEvent.type(within(screen.getByRole('form', { name: 'Add a task' })).getByLabelText('Title'), 'Counted');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByText('Task added.');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Dashboard' }));
    const stats = await screen.findByLabelText('Task statistics');
    expect(within(stats).getByText('Open tasks').nextElementSibling).toHaveTextContent('1');
  });
});

describe('dashboard: planner, quiz and activity sections', () => {
  const upcoming = (id: string, title: string, startsAt: string, endsAt: string) => ({ id, title, startsAt, endsAt, materialId: null, taskId: null, createdAt: startsAt, updatedAt: startsAt });

  it('lists the next study sessions, earliest first, and links to the planner', async () => {
    const api = stubApi({
      'GET /api/sessions': () =>
        jsonResponse({
          items: [
            upcoming('s-2', 'Later session', '2030-06-14T10:00:00.000Z', '2030-06-14T11:00:00.000Z'),
            upcoming('s-1', 'Sooner session', '2030-06-13T10:00:00.000Z', '2030-06-13T11:00:00.000Z'),
          ],
        }),
    });
    await renderSignedIn('/');
    const list = await screen.findByRole('list', { name: 'Upcoming study sessions' });
    expect(within(list).getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent)).toEqual(['Sooner session', 'Later session']);
    expect(screen.getByRole('link', { name: 'Open the planner' })).toHaveAttribute('href', '/planner');
    const query = new URLSearchParams(api.callsTo('GET /api/sessions')[0]?.path.split('?')[1]);
    expect(query.get('limit')).toBe('5');
    const days = (Date.parse(query.get('to') as string) - Date.parse(query.get('from') as string)) / 86_400_000;
    expect(days).toBe(14);
  });

  it('shows an empty state that links to the planner when nothing is planned', async () => {
    stubApi();
    await renderSignedIn('/');
    expect(await screen.findByRole('link', { name: 'Plan a study session' })).toHaveAttribute('href', '/planner');
  });

  it('shows the quiz figures of the last 7 days from the analytics', async () => {
    stubApi({
      'GET /api/analytics': () => {
        const stats = emptyAnalytics('7d');
        Object.assign(stats.quizzes, { attempts: 3, quizzes: 2, averageScorePercent: 82 });
        return jsonResponse(stats);
      },
    });
    await renderSignedIn('/');
    const quizzes = await screen.findByLabelText('Quiz statistics');
    expect(within(quizzes).getByText('Attempts, last 7 days').nextElementSibling).toHaveTextContent('3');
    expect(within(quizzes).getByText('Average score').nextElementSibling).toHaveTextContent('82%');
    expect(screen.getByRole('link', { name: 'See all statistics' })).toHaveAttribute('href', '/analytics');
  });

  it('shows what the user did recently, newest first as the server sends it', async () => {
    stubApi({
      'GET /api/activity': () =>
        jsonResponse({
          items: [
            { id: 'a-1', type: 'quiz_submitted', title: 'Capitals', detail: '80%', at: '2030-06-14T10:00:00.000Z' },
            { id: 'a-2', type: 'task_completed', title: 'Read chapter 4', detail: null, at: '2030-06-13T10:00:00.000Z' },
            { id: 'a-3', type: 'material_uploaded', title: 'biology.txt', detail: null, at: '2030-06-12T10:00:00.000Z' },
            { id: 'a-4', type: 'session_scheduled', title: 'Revise cells', detail: null, at: '2030-06-11T10:00:00.000Z' },
          ],
        }),
    });
    await renderSignedIn('/');
    const list = await screen.findByRole('list', { name: 'Recent activity' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Submitted a quiz: Capitals (80%)');
    expect(items[1]).toHaveTextContent('Completed a task: Read chapter 4');
    expect(items[1]).not.toHaveTextContent('(');
    expect(items[2]).toHaveTextContent('Uploaded a material: biology.txt');
    expect(items[3]).toHaveTextContent('Scheduled a session: Revise cells');
  });

  it('says there is no activity yet', async () => {
    stubApi();
    await renderSignedIn('/');
    expect(await screen.findByText('Nothing yet. What you finish and schedule will show up here.')).toBeInTheDocument();
  });

  it('shows a separate error and retry for each section that fails, leaving the others alone', async () => {
    let failing = true;
    stubApi({
      'GET /api/sessions': () => (failing ? errorResponse('INTERNAL', 'Sessions are down.', 500) : jsonResponse({ items: [] })),
      'GET /api/activity': () => (failing ? errorResponse('INTERNAL', 'Activity is down.', 500) : jsonResponse({ items: [] })),
      'GET /api/analytics': () => (failing ? errorResponse('INTERNAL', 'Quizzes are down.', 500) : jsonResponse(emptyAnalytics('7d'))),
    });
    await renderSignedIn('/');
    expect(await screen.findByText('Sessions are down.')).toBeInTheDocument();
    expect(await screen.findByText('Activity is down.')).toBeInTheDocument();
    expect(await screen.findByText('Quizzes are down.')).toBeInTheDocument();
    expect(await screen.findByText('You have no tasks yet', { exact: false })).toBeInTheDocument();

    failing = false;
    for (const retry of screen.getAllByRole('button', { name: 'Retry' })) await userEvent.click(retry);
    expect(await screen.findByText('No study sessions planned yet.')).toBeInTheDocument();
    expect(screen.getByText('No quizzes taken yet.')).toBeInTheDocument();
    expect(screen.queryByText('Sessions are down.')).not.toBeInTheDocument();
  });
});
