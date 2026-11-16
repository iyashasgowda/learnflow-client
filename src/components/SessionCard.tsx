import type { StudySession } from '../api/sessions';
import { useFormatters } from '../settings/useFormatters';
import { formatDay, localDate } from '../time/zone';

interface Props {
  session: StudySession;
  overlapping: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, overlapping, onEdit, onDelete }: Props) {
  const { time, timeZone } = useFormatters();
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  const endsLater = localDate(end, timeZone) !== localDate(start, timeZone);

  return (
    <li className={`planner-session${overlapping ? ' planner-session-overlap' : ''}`}>
      <p className="planner-time">
        {time(start)} – {time(end)}
        {endsLater && ` (${formatDay(localDate(end, timeZone))})`}
      </p>
      <p className="planner-title">{session.title}</p>
      {overlapping && <p className="badge badge-overdue planner-overlap">Overlaps another session</p>}
      <div className="upload-actions">
        <button type="button" className="button button-quiet" onClick={onEdit} aria-label={`Edit: ${session.title}`}>
          Edit
        </button>
        <button type="button" className="button button-quiet" onClick={onDelete} aria-label={`Delete: ${session.title}`}>
          Delete
        </button>
      </div>
    </li>
  );
}
