import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ActivityItem } from '../api/analytics';
import { useActivity, useAnalytics } from '../analytics/hooks';
import { describeAuthError } from '../auth/authForm';
import { DASHBOARD_LIMITS, MESSAGES } from '../constants';
import { useSessions } from '../planner/hooks';
import { sortSessions } from '../planner/schedule';
import { useFormatters } from '../settings/useFormatters';
import { formatDay, localDate } from '../time/zone';

const MS_PER_DAY = 86_400_000;

const ACTIVITY_LABEL: Record<ActivityItem['type'], string> = {
  task_completed: 'Completed a task',
  quiz_submitted: 'Submitted a quiz',
  material_uploaded: 'Uploaded a material',
  session_scheduled: 'Scheduled a session',
};

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="notice">
      <p>{describeAuthError(error).form ?? MESSAGES.generic}</p>
      <button type="button" className="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// The next sessions from the planner, from now: the same endpoint the planner uses.
export function UpcomingSessions() {
  const { time, timeZone } = useFormatters();
  const [openedAt] = useState(() => Date.now());
  const sessions = useSessions(new Date(openedAt).toISOString(), new Date(openedAt + DASHBOARD_LIMITS.upcomingDays * MS_PER_DAY).toISOString(), DASHBOARD_LIMITS.upcomingSessions);
  const items = sortSessions(sessions.data?.items ?? []);

  return (
    <section className="card" aria-labelledby="sessions-heading">
      <h2 id="sessions-heading">Upcoming study sessions</h2>
      {sessions.isPending && <p role="status">Loading your sessions…</p>}
      {sessions.isError && <LoadError error={sessions.error} onRetry={() => void sessions.refetch()} />}
      {sessions.isSuccess && items.length === 0 && (
        <>
          <p className="text-muted">No study sessions planned yet.</p>
          <Link to="/planner">Plan a study session</Link>
        </>
      )}
      {items.length > 0 && (
        <>
          <ul className="activity-list" aria-label="Upcoming study sessions">
            {items.map((session) => (
              <li key={session.id}>
                <strong>{session.title}</strong>
                <span className="text-muted">
                  {' '}
                  {formatDay(localDate(new Date(session.startsAt), timeZone))}, {time(session.startsAt)} – {time(session.endsAt)}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/planner">Open the planner</Link>
        </>
      )}
    </section>
  );
}

// Last seven days of quizzes, from the same analytics the Analytics page shows.
export function DashboardQuizResults() {
  const analytics = useAnalytics('7d');
  const quizzes = analytics.data?.quizzes;

  return (
    <section className="card" aria-labelledby="quiz-heading">
      <h2 id="quiz-heading">Quiz results</h2>
      {analytics.isPending && <p role="status">Loading your quiz results…</p>}
      {analytics.isError && <LoadError error={analytics.error} onRetry={() => void analytics.refetch()} />}
      {quizzes && quizzes.attempts === 0 && <p className="text-muted">No quizzes taken yet.</p>}
      {quizzes && quizzes.attempts > 0 && (
        <>
          <dl className="stats" aria-label="Quiz statistics">
            <div className="stat">
              <dt>Attempts, last 7 days</dt>
              <dd>{quizzes.attempts}</dd>
            </div>
            <div className="stat">
              <dt>Average score</dt>
              <dd>{quizzes.averageScorePercent}%</dd>
            </div>
          </dl>
          <Link to="/analytics">See all statistics</Link>
        </>
      )}
    </section>
  );
}

export function RecentActivity() {
  const { dateTime } = useFormatters();
  const activity = useActivity(DASHBOARD_LIMITS.recentActivity);
  const items = activity.data?.items ?? [];

  return (
    <section className="card" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Recent activity</h2>
      {activity.isPending && <p role="status">Loading your activity…</p>}
      {activity.isError && <LoadError error={activity.error} onRetry={() => void activity.refetch()} />}
      {activity.isSuccess && items.length === 0 && <p className="text-muted">Nothing yet. What you finish and schedule will show up here.</p>}
      {items.length > 0 && (
        <ul className="activity-list" aria-label="Recent activity">
          {items.map((item) => (
            <li key={item.id}>
              <span>{ACTIVITY_LABEL[item.type]}: </span>
              <strong>{item.title}</strong>
              {item.type === 'quiz_submitted' && item.detail && <span> ({item.detail})</span>}
              <span className="text-muted"> · {dateTime(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
