import { Link } from 'react-router-dom';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { DashboardQuizResults, RecentActivity, UpcomingSessions } from '../components/DashboardSections';
import { describeAuthError } from '../auth/authForm';
import { MESSAGES } from '../constants';
import { useDashboardSummary } from '../tasks/hooks';

export function DashboardPage() {
  const summary = useDashboardSummary();
  const tasks = summary.data?.tasks;

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Dashboard</h1>
        <p>Your tasks, sessions, and progress at a glance.</p>

        {summary.isPending && <p role="status">Loading your numbers…</p>}

        {summary.isError && (
          <div role="alert" className="notice">
            <p>{describeAuthError(summary.error).form ?? MESSAGES.generic}</p>
            <button type="button" className="button" onClick={() => void summary.refetch()}>
              Retry
            </button>
          </div>
        )}

        {tasks && tasks.total === 0 && (
          <p>
            You have no tasks yet. <Link to="/tasks">Add your first task</Link> and your progress will show up here.
          </p>
        )}

        {tasks && tasks.total > 0 && (
          <dl className="stats" aria-label="Task statistics">
            <div className="stat">
              <dt>Open tasks</dt>
              <dd>{tasks.active}</dd>
            </div>
            <div className="stat">
              <dt>Completed</dt>
              <dd>{tasks.completed}</dd>
            </div>
            <div className="stat">
              <dt>Overdue</dt>
              <dd>{tasks.overdue}</dd>
            </div>
            <div className="stat">
              <dt>Completion rate</dt>
              <dd>{tasks.completionRate}%</dd>
            </div>
          </dl>
        )}
      </section>

      <UpcomingSessions />
      <DashboardQuizResults />
      <RecentActivity />

      <ConnectionStatus />
    </>
  );
}
