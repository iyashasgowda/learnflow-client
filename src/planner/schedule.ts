import type { FieldErrors } from '../auth/authForm';
import type { NewStudySession, StudySession } from '../api/sessions';
import { PLANNER_LIMITS } from '../constants';
import { fromZonedLocal, localDate, localTime } from '../time/zone';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

// Earliest start first; sessions that start together are ordered by end and then id, so the order never changes. Works on a copy.
export function sortSessions(sessions: readonly StudySession[]): StudySession[] {
  return [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt) || a.id.localeCompare(b.id));
}

// The ids of sessions that overlap another one. Touching sessions (one ends as the next starts) do not overlap.
export function overlappingIds(sessions: readonly StudySession[]): Set<string> {
  const ordered = sortSessions(sessions);
  const overlapping = new Set<string>();
  ordered.forEach((first, index) => {
    for (const second of ordered.slice(index + 1)) {
      // Sorted by start: once one begins at or after this end, so does every later one.
      if (second.startsAt >= first.endsAt) break;
      overlapping.add(first.id);
      overlapping.add(second.id);
    }
  });
  return overlapping;
}

// Sessions grouped under the local day they start on (or the first shown day, for one that began earlier), in order.
export function groupByDay(sessions: readonly StudySession[], days: readonly string[], zone: string): Array<{ date: string; sessions: StudySession[] }> {
  const first = days[0] as string;
  const groups = new Map(days.map((date) => [date, [] as StudySession[]]));
  for (const session of sortSessions(sessions)) {
    const start = localDate(new Date(session.startsAt), zone);
    const day = start < first ? first : start;
    groups.get(day)?.push(session);
  }
  return days.map((date) => ({ date, sessions: groups.get(date) ?? [] }));
}

export interface SessionFormValues {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  materialId: string;
  taskId: string;
}

export const emptySessionForm = (date: string): SessionFormValues => ({
  title: '',
  startDate: date,
  startTime: PLANNER_LIMITS.defaultStart,
  endDate: date,
  endTime: PLANNER_LIMITS.defaultEnd,
  materialId: '',
  taskId: '',
});

export function formFromSession(session: StudySession, zone: string): SessionFormValues {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  return {
    title: session.title,
    startDate: localDate(start, zone),
    startTime: localTime(start, zone),
    endDate: localDate(end, zone),
    endTime: localTime(end, zone),
    materialId: session.materialId ?? '',
    taskId: session.taskId ?? '',
  };
}

export type ValidatedSession = { ok: true; request: NewStudySession } | { ok: false; errors: FieldErrors };

function instantOf(date: string, time: string, zone: string, label: 'start' | 'end'): { at: Date } | { error: string } {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return { error: `Enter a valid ${label} date and time.` };
  const at = fromZonedLocal(date, time, zone);
  return at ? { at } : { error: `That ${label} time does not exist on that date in your time zone, because the clocks go forward. Pick another time.` };
}

// Checks the form the way the server will, in the user's zone, so a mistake is shown next to its field before anything is sent.
export function validateSessionForm(values: SessionFormValues, zone: string): ValidatedSession {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Enter a title.';
  else if (title.length > PLANNER_LIMITS.titleMax) errors.title = `Use at most ${PLANNER_LIMITS.titleMax} characters.`;

  const start = instantOf(values.startDate, values.startTime, zone, 'start');
  const end = instantOf(values.endDate, values.endTime, zone, 'end');
  if ('error' in start) errors.start = start.error;
  if ('error' in end) errors.end = end.error;
  if ('at' in start && 'at' in end) {
    const length = end.at.getTime() - start.at.getTime();
    if (length <= 0) errors.end = 'The end must be after the start.';
    else if (length > PLANNER_LIMITS.maxMs) errors.end = 'A session can last at most 12 hours.';
  }

  if (Object.keys(errors).length > 0 || !('at' in start) || !('at' in end)) return { ok: false, errors };
  return {
    ok: true,
    request: {
      title,
      startsAt: start.at.toISOString(),
      endsAt: end.at.toISOString(),
      materialId: values.materialId || null,
      taskId: values.taskId || null,
    },
  };
}

// The server names fields as it knows them; the form calls the two times start and end.
export function formFieldsFromServer(fields: FieldErrors): FieldErrors {
  const { startsAt, endsAt, ...rest } = fields;
  return { ...rest, ...(startsAt ? { start: startsAt } : {}), ...(endsAt ? { end: endsAt } : {}) };
}
