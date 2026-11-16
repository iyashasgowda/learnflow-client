import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { emptyAnalytics, errorResponse, jsonResponse, renderSignedIn, stubApi } from './testUtils';

const user = userEvent.setup();

type Stats = ReturnType<typeof emptyAnalytics>;

const withData = (range: '7d' | '30d' | '90d' = '7d', patch: (stats: Stats) => void = () => undefined): Stats => {
  const stats = emptyAnalytics(range);
  const series = stats.tasks.series;
  const last = series.length - 1;
  Object.assign(series[last - 1] as object, { created: 3, completed: 1 });
  Object.assign(series[last] as object, { created: 1, completed: 2 });
  Object.assign(stats.tasks, { created: 4, completed: 3, activeInRange: 5, completionRate: 60 });
  Object.assign(stats.study.series[last] as object, { minutes: 90 });
  Object.assign(stats.study, { totalMinutes: 90 });
  Object.assign(stats.quizzes, {
    attempts: 2,
    quizzes: 1,
    averageScorePercent: 75,
    trend: [
      { attemptId: 'a-1', quizId: 'q-1', quizTitle: 'Capitals', submittedAt: '2030-06-13T10:00:00.000Z', scorePercent: 50 },
      { attemptId: 'a-2', quizId: 'q-1', quizTitle: 'Capitals', submittedAt: '2030-06-14T10:00:00.000Z', scorePercent: 100 },
    ],
  });
  patch(stats);
  return stats;
};

const rangeOf = (request: { path: string }) => new URLSearchParams(request.path.split('?')[1]).get('range');

async function open(handler: (range: string) => Response | Promise<Response>) {
  const api = stubApi({ 'GET /api/analytics': (request) => handler(rangeOf(request) ?? '7d') });
  await renderSignedIn('/analytics');
  return api;
}

describe('analytics page', () => {
  it('asks for the last 7 days first and shows the range in the user\'s time zone', async () => {
    const api = await open((range) => jsonResponse(withData(range as '7d')));
    expect(await screen.findByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument();
    await screen.findByRole('heading', { level: 2, name: 'Tasks' });
    expect(api.callsTo('GET /api/analytics').map(rangeOf)).toEqual(['7d']);
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(/Sat, Jun 9 to Sat, Jun 15|Jun 9 to .* Jun 15/);
  });

  it('shows the figures from the server', async () => {
    await open(() => jsonResponse(withData()));
    const tasks = await screen.findByLabelText('Task figures');
    const value = (area: HTMLElement, name: string) => within(area).getByText(name).nextElementSibling?.textContent;
    expect(value(tasks, 'Created')).toBe('4');
    expect(value(tasks, 'Completed')).toBe('3');
    expect(value(tasks, 'Completion rate')).toBe('60%');
    const quizzes = screen.getByLabelText('Quiz figures');
    expect(value(quizzes, 'Attempts')).toBe('2');
    expect(value(quizzes, 'Quizzes')).toBe('1');
    expect(value(quizzes, 'Average score')).toBe('75%');
    expect(value(screen.getByLabelText('Study figures'), 'Scheduled study time')).toBe('1 h 30 min');
  });

  it('updates every chart and figure when the range changes', async () => {
    const api = await open((range) => jsonResponse(withData(range as '7d' | '30d' | '90d', (stats) => Object.assign(stats.tasks, { created: range === '30d' ? 40 : 4 }))));
    await screen.findByLabelText('Task figures');
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(await within(await screen.findByLabelText('Task figures')).findByText('40')).toBeInTheDocument();
    expect(api.callsTo('GET /api/analytics').map(rangeOf)).toEqual(['7d', '30d']);
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    // Every day of the range is in the data table, with zeros for quiet days.
    const table = within(screen.getByRole('heading', { name: 'Tasks' }).closest('section') as HTMLElement).getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(31);

    await user.click(screen.getByRole('button', { name: 'Last 90 days' }));
    await screen.findByLabelText('Task figures');
    expect(api.callsTo('GET /api/analytics').map(rangeOf)).toEqual(['7d', '30d', '90d']);
  });

  it('gives each chart a text description and a data table', async () => {
    await open(() => jsonResponse(withData()));
    const charts = await screen.findAllByRole('img');
    expect(charts).toHaveLength(3);
    expect(charts[0]).toHaveAccessibleName(/Tasks created and completed per day\. 4 created and 3 completed\. Most completed on .*: 2\./);
    expect(charts[1]).toHaveAccessibleName(/Quiz score for each submitted attempt\. 2 attempts, average 75%\. Scores in order: 50%, 100%\./);
    expect(charts[2]).toHaveAccessibleName(/Scheduled study minutes per day\. 1 h 30 min in total\./);
    expect(screen.getAllByText('Show the data as a table')).toHaveLength(3);
    const quizTable = within(screen.getByRole('heading', { name: 'Quiz scores' }).closest('section') as HTMLElement).getByRole('table', { hidden: true });
    expect(within(quizTable).getAllByRole('row', { hidden: true }).map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Capitals'), expect.stringContaining('100%')]));
  });

  it('tells the two task series apart by more than colour', async () => {
    await open(() => jsonResponse(withData()));
    await screen.findAllByRole('img');
    const [legend] = screen.getAllByRole('list', { name: 'Legend' });
    expect(legend).toHaveTextContent('Created (solid bars)');
    expect(legend).toHaveTextContent('Completed (striped bars)');
  });

  it('shows an empty state in place of each chart, and zero or absent figures, for a user with no activity', async () => {
    await open((range) => jsonResponse(emptyAnalytics(range as '7d')));
    expect(await screen.findByText('No task activity in this range yet.')).toBeInTheDocument();
    expect(screen.getByText('No submitted quizzes in this range yet. Attempts you have not submitted are not counted.')).toBeInTheDocument();
    expect(screen.getByText('No study sessions in this range yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { hidden: true })).not.toBeInTheDocument();
    const quizzes = screen.getByLabelText('Quiz figures');
    expect(within(quizzes).getByText('Average score').nextElementSibling).toHaveTextContent('—');
    expect(within(screen.getByLabelText('Task figures')).getByText('Completion rate').nextElementSibling).toHaveTextContent('0%');
    expect(within(screen.getByLabelText('Study figures')).getByText('Scheduled study time').nextElementSibling).toHaveTextContent('0 min');
  });

  it('shows a chart only for the parts that have data', async () => {
    await open(() => jsonResponse(withData('7d', (stats) => { Object.assign(stats.study, { totalMinutes: 0 }); Object.assign(stats.quizzes, { attempts: 0, averageScorePercent: null, trend: [] }); })));
    await screen.findByLabelText('Task figures');
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('No study sessions in this range yet.')).toBeInTheDocument();
  });

  it('shows a single quiz attempt as one point', async () => {
    await open(() => jsonResponse(withData('7d', (stats) => Object.assign(stats.quizzes, { attempts: 1, averageScorePercent: 80, trend: [{ attemptId: 'a-1', quizId: 'q-1', quizTitle: 'Capitals', submittedAt: '2030-06-14T10:00:00.000Z', scorePercent: 80 }] }))));
    const chart = (await screen.findAllByRole('img'))[1] as HTMLElement;
    expect(chart.querySelectorAll('circle')).toHaveLength(1);
    expect(chart.querySelector('path')).toBeNull();
  });

  it('shows durations of whole hours and of minutes', async () => {
    await open(() => jsonResponse(withData('7d', (stats) => Object.assign(stats.study, { totalMinutes: 120 }))));
    expect(within(await screen.findByLabelText('Study figures')).getByText('2 h')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    let fail = true;
    await open(() => (fail ? errorResponse('INTERNAL', 'Statistics are unavailable.', 500) : jsonResponse(withData())));
    expect(await screen.findByText('Statistics are unavailable.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Task figures')).toBeInTheDocument();
  });
});
