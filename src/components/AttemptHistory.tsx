import type { AttemptSummary } from '../api/quizzes';
import { useFormatters } from '../settings/useFormatters';

interface Props {
  items: AttemptSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

const describe = (attempt: AttemptSummary): string =>
  attempt.status === 'submitted' ? `${attempt.score} of ${attempt.total} (${attempt.percent}%)` : 'In progress';

// Past attempts stay viewable; the newest is first.
export function AttemptHistory({ items, activeId, onSelect }: Props) {
  const { dateTime } = useFormatters();
  if (items.length < 2) return null;
  return (
    <section className="card" aria-label="Attempts">
      <h2>Attempts</h2>
      <ul className="material-list">
        {items.map((attempt) => (
          <li key={attempt.id} className="material">
            <div className="material-body">
              <p className="material-name">{dateTime(attempt.startedAt)}</p>
              <p className="task-meta">
                <span>{describe(attempt)}</span>
              </p>
            </div>
            <button type="button" className="button button-quiet" aria-current={attempt.id === activeId ? 'true' : undefined} disabled={attempt.id === activeId} onClick={() => onSelect(attempt.id)}>
              {attempt.id === activeId ? 'Showing' : 'View'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
