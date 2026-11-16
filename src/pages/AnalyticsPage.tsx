import { useState } from 'react';
import type { Analytics, AnalyticsRange } from '../api/analytics';
import { formatDuration, peak } from '../analytics/format';
import { useAnalytics } from '../analytics/hooks';
import { describeAuthError } from '../auth/authForm';
import { BarChart } from '../components/BarChart';
import { DataTable } from '../components/DataTable';
import { LineChart } from '../components/LineChart';
import { ANALYTICS_RANGES, MESSAGES } from '../constants';
import { useFormatters } from '../settings/useFormatters';
import { formatDay } from '../time/zone';

function TaskSection({ stats }: { stats: Analytics['tasks'] }) {
  const dates = stats.series.map((day) => day.date);
  const empty = stats.created === 0 && stats.completed === 0 && stats.activeInRange === 0;
  const busiest = peak(dates, stats.series.map((day) => day.completed));
  return (
    <section className="card" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>
      <dl className="stats" aria-label="Task figures">
        <div className="stat">
          <dt>Created</dt>
          <dd>{stats.created}</dd>
        </div>
        <div className="stat">
          <dt>Completed</dt>
          <dd>{stats.completed}</dd>
        </div>
        <div className="stat">
          <dt>Completion rate</dt>
          <dd>{stats.completionRate}%</dd>
        </div>
      </dl>
      {empty ? (
        <p className="text-muted">No task activity in this range yet.</p>
      ) : (
        <>
          <BarChart
            title="Tasks created and completed per day"
            summary={`${stats.created} created and ${stats.completed} completed.${busiest ? ` Most completed on ${formatDay(busiest.date)}: ${busiest.value}.` : ''}`}
            labels={dates.map(formatDay)}
            series={[
              { name: 'Created', values: stats.series.map((day) => day.created), style: 'solid' },
              { name: 'Completed', values: stats.series.map((day) => day.completed), style: 'striped' },
            ]}
          />
          <DataTable caption="Tasks per day" columns={['Day', 'Created', 'Completed']} rows={stats.series.map((day) => [formatDay(day.date), day.created, day.completed])} />
        </>
      )}
    </section>
  );
}

function QuizSection({ stats }: { stats: Analytics['quizzes'] }) {
  const { dateTime } = useFormatters();
  return (
    <section className="card" aria-labelledby="quiz-scores-heading">
      <h2 id="quiz-scores-heading">Quiz scores</h2>
      <dl className="stats" aria-label="Quiz figures">
        <div className="stat">
          <dt>Attempts</dt>
          <dd>{stats.attempts}</dd>
        </div>
        <div className="stat">
          <dt>Quizzes</dt>
          <dd>{stats.quizzes}</dd>
        </div>
        <div className="stat">
          <dt>Average score</dt>
          <dd>{stats.averageScorePercent === null ? '—' : `${stats.averageScorePercent}%`}</dd>
        </div>
      </dl>
      {stats.trend.length === 0 ? (
        <p className="text-muted">No submitted quizzes in this range yet. Attempts you have not submitted are not counted.</p>
      ) : (
        <>
          <LineChart
            title="Quiz score for each submitted attempt"
            summary={`${stats.attempts} attempts, average ${stats.averageScorePercent}%. Scores in order: ${stats.trend.map((point) => `${point.scorePercent}%`).join(', ')}.`}
            points={stats.trend.map((point) => ({ label: `${point.quizTitle}, ${dateTime(point.submittedAt)}`, value: point.scorePercent }))}
          />
          <DataTable caption="Submitted quiz attempts" columns={['Submitted', 'Quiz', 'Score']} rows={stats.trend.map((point) => [dateTime(point.submittedAt), point.quizTitle, `${point.scorePercent}%`])} />
        </>
      )}
    </section>
  );
}

function StudySection({ stats }: { stats: Analytics['study'] }) {
  const dates = stats.series.map((day) => day.date);
  const busiest = peak(dates, stats.series.map((day) => day.minutes));
  return (
    <section className="card" aria-labelledby="study-heading">
      <h2 id="study-heading">Study time</h2>
      <dl className="stats" aria-label="Study figures">
        <div className="stat">
          <dt>Scheduled study time</dt>
          <dd>{formatDuration(stats.totalMinutes)}</dd>
        </div>
      </dl>
      {stats.totalMinutes === 0 ? (
        <p className="text-muted">No study sessions in this range yet.</p>
      ) : (
        <>
          <BarChart
            title="Scheduled study minutes per day"
            summary={`${formatDuration(stats.totalMinutes)} in total.${busiest ? ` Most on ${formatDay(busiest.date)}: ${formatDuration(busiest.value)}.` : ''}`}
            labels={dates.map(formatDay)}
            series={[{ name: 'Minutes', values: stats.series.map((day) => day.minutes), style: 'solid' }]}
          />
          <DataTable caption="Study time per day" columns={['Day', 'Minutes']} rows={stats.series.map((day) => [formatDay(day.date), day.minutes])} />
        </>
      )}
    </section>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const analytics = useAnalytics(range);
  const { data } = analytics;

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Analytics</h1>
        <p>See how your studying is going. Every figure comes from your own tasks, quizzes and planned sessions.</p>
        <div className="chips" role="group" aria-label="Date range">
          {ANALYTICS_RANGES.map((option) => (
            <button key={option.value} type="button" className="chip" aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        {data && (
          <p className="text-muted" role="status">
            {formatDay(data.from)} to {formatDay(data.to)}, in your time zone ({data.timeZone.replaceAll('_', ' ')}).
          </p>
        )}
      </section>

      {analytics.isPending && <p role="status">Loading your statistics…</p>}
      {analytics.isError && (
        <div role="alert" className="notice">
          <p>{describeAuthError(analytics.error).form ?? MESSAGES.generic}</p>
          <button type="button" className="button" onClick={() => void analytics.refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <TaskSection stats={data.tasks} />
          <QuizSection stats={data.quizzes} />
          <StudySection stats={data.study} />
        </>
      )}
    </>
  );
}
