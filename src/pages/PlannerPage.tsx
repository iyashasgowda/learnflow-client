import { useState } from 'react';
import type { StudySession } from '../api/sessions';
import { describeAuthError } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PlannerSchedule } from '../components/PlannerSchedule';
import { SessionDialog } from '../components/SessionDialog';
import { MESSAGES } from '../constants';
import { useDeleteSession, useSessions } from '../planner/hooks';
import { useIsNarrow } from '../planner/useIsNarrow';
import { useSettings } from '../settings/settingsContext';
import { addDays, formatDay, localDate, startOfLocalDay, weekDates, weekStartOf } from '../time/zone';

type Dialog = { kind: 'add' } | { kind: 'edit'; session: StudySession } | null;

// The week, the times and "today" all depend on the user's time zone, so nothing is asked for before it is known.
export function PlannerPage() {
  const { status, loadError, retry } = useSettings();
  if (status === 'ready') return <Planner />;
  return (
    <section className="card" aria-labelledby="page-heading">
      <h1 id="page-heading">Study Planner</h1>
      {status === 'loading' && <p role="status">Loading your settings…</p>}
      {status === 'error' && (
        <div role="alert" className="notice">
          <p>{loadError}</p>
          <button type="button" className="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}

function Planner() {
  const { settings } = useSettings();
  const { timeZone, weekStart } = settings;
  const narrow = useIsNarrow();

  // The moment the page was opened (refreshed by "This week"): the clock is not read while rendering, and today follows the zone.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const today = localDate(new Date(openedAt), timeZone);
  const [anchor, setAnchor] = useState<string | null>(null);

  const first = weekStartOf(anchor ?? today, weekStart);
  const days = weekDates(first);
  const from = startOfLocalDay(first, timeZone).toISOString();
  const to = startOfLocalDay(addDays(first, days.length), timeZone).toISOString();
  const sessions = useSessions(from, to);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<StudySession | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const remove = useDeleteSession();
  const deleteAction = useAsyncAction();

  const items = sessions.data?.items ?? [];
  const containsToday = days.includes(today);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    const result = await deleteAction.run(() => remove.mutateAsync(deleting.id));
    if (!result) return;
    if (result.ok) {
      setDeleting(null);
      setMessage('Session deleted.');
    } else {
      setDeleteError(describeAuthError(result.error).form ?? MESSAGES.generic);
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Study Planner</h1>
        <p>Schedule your study sessions. Times are shown in your time zone ({timeZone.replaceAll('_', ' ')}).</p>

        <div className="task-toolbar">
          <div className="button-row" role="group" aria-label="Choose a week">
            <button type="button" className="button button-quiet" onClick={() => setAnchor(addDays(first, -days.length))}>
              Previous week
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={containsToday && anchor === null}
              onClick={() => {
                setOpenedAt(Date.now());
                setAnchor(null);
              }}
            >
              This week
            </button>
            <button type="button" className="button button-quiet" onClick={() => setAnchor(addDays(first, days.length))}>
              Next week
            </button>
          </div>
          <button type="button" className="button" onClick={() => setDialog({ kind: 'add' })}>
            Add session
          </button>
        </div>

        <h2 className="planner-range" aria-live="polite">
          {formatDay(days[0] as string)} – {formatDay(days[days.length - 1] as string)}
        </h2>

        <p className="task-notice" role="status">
          {message}
        </p>

        {sessions.isPending && <p role="status">Loading your sessions…</p>}
        {sessions.isError && (
          <div role="alert" className="notice">
            <p>{describeAuthError(sessions.error).form ?? MESSAGES.generic}</p>
            <button type="button" className="button" onClick={() => void sessions.refetch()}>
              Retry
            </button>
          </div>
        )}

        {sessions.isSuccess && items.length === 0 && (
          <div className="notice">
            <p>No study sessions this week.</p>
            <button type="button" className="button" onClick={() => setDialog({ kind: 'add' })}>
              Add a session
            </button>
          </div>
        )}

        {sessions.isSuccess && items.length > 0 && (
          <PlannerSchedule
            days={days}
            sessions={items}
            today={today}
            zone={timeZone}
            layout={narrow ? 'agenda' : 'week'}
            onEdit={(session) => setDialog({ kind: 'edit', session })}
            onDelete={(session) => {
              setDeleteError(null);
              setDeleting(session);
            }}
          />
        )}
      </section>

      {dialog && (
        <SessionDialog
          key={dialog.kind === 'edit' ? dialog.session.id : 'new'}
          session={dialog.kind === 'edit' ? dialog.session : null}
          defaultDate={containsToday ? today : first}
          onClose={(done) => {
            setDialog(null);
            setMessage(done ?? null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this session?"
          confirmLabel="Delete session"
          pendingLabel="Deleting…"
          pending={deleteAction.pending}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        >
          <p>“{deleting.title}” will be removed from your planner.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
