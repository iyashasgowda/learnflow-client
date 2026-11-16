import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSession, deleteSession, listSessions, updateSession, type NewStudySession, type StudySessionPatch } from '../api/sessions';
import { PLANNER_LIMITS } from '../constants';

const SESSIONS_KEY = ['sessions'] as const;

// Sessions overlapping [from, to), as ISO instants. The planner and the dashboard share this cache.
export const useSessions = (from: string, to: string, limit: number = PLANNER_LIMITS.agendaLimit) =>
  useQuery({ queryKey: [...SESSIONS_KEY, from, to, limit], queryFn: ({ signal }) => listSessions(from, to, limit, signal) });

// A session change also refreshes what is derived from sessions: study time and recent activity.
function useRefreshAfter() {
  const queryClient = useQueryClient();
  return () => Promise.all([SESSIONS_KEY, ['analytics'], ['activity']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useCreateSession() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (session: NewStudySession) => createSession(session), onSuccess: refresh });
}

export function useUpdateSession() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: StudySessionPatch }) => updateSession(id, patch), onSuccess: refresh });
}

export function useDeleteSession() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (id: string) => deleteSession(id), onSuccess: refresh });
}
