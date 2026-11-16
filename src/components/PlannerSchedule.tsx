import type { StudySession } from '../api/sessions';
import { groupByDay, overlappingIds } from '../planner/schedule';
import { formatDay, formatLongDay } from '../time/zone';
import { SessionCard } from './SessionCard';

interface Props {
  days: string[];
  sessions: StudySession[];
  today: string;
  zone: string;
  // Desktop shows every day of the week as a column; a phone shows only the days with something planned.
  layout: 'week' | 'agenda';
  onEdit: (session: StudySession) => void;
  onDelete: (session: StudySession) => void;
}

export function PlannerSchedule({ days, sessions, today, zone, layout, onEdit, onDelete }: Props) {
  const overlapping = overlappingIds(sessions);
  const groups = groupByDay(sessions, days, zone).filter((group) => layout === 'week' || group.sessions.length > 0);

  return (
    <div className={layout === 'week' ? 'planner-week' : 'planner-agenda'} role="group" aria-label={layout === 'week' ? 'Week view' : 'Agenda'}>
      {groups.map(({ date, sessions: daySessions }) => (
        <section key={date} className={`planner-day${date === today ? ' planner-day-today' : ''}`} aria-label={formatLongDay(date)}>
          <h3>
            {formatDay(date)}
            {date === today && <span className="text-muted"> (today)</span>}
          </h3>
          {daySessions.length === 0 ? (
            <p className="text-muted">Nothing planned</p>
          ) : (
            <ul className="planner-list">
              {daySessions.map((session) => (
                <SessionCard key={session.id} session={session} overlapping={overlapping.has(session.id)} onEdit={() => onEdit(session)} onDelete={() => onDelete(session)} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
