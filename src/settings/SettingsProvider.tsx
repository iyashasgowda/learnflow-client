import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSettings, updateSettings, type Settings, type SettingsChanges } from '../api/settings';
import { describeAuthError } from '../auth/authForm';
import { MESSAGES } from '../constants';
import { DEFAULT_THEME_MODE, isThemeMode } from '../theme/theme';
import { useTheme } from '../theme/themeContext';
import { detectTimeZone } from '../time/zone';
import { SettingsContext, type SaveOutcome, type SettingsContextValue } from './settingsContext';

const FIELDS = ['theme', 'timeZone', 'weekStart'] as const;

// Loads the signed-in user's settings once, applies the theme everywhere, and saves changes optimistically.
export function SettingsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { setMode } = useTheme();
  const key = useMemo(() => ['settings', userId] as const, [userId]);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getSettings(signal), staleTime: Infinity });
  const [saveError, setSaveError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onMutate: async (changes: SettingsChanges) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Settings>(key);
      if (previous) queryClient.setQueryData<Settings>(key, { ...previous, ...changes });
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });
  const { mutate, mutateAsync } = mutation;
  const { refetch } = query;

  const theme = query.data?.theme;
  useEffect(() => {
    if (theme !== undefined) setMode(isThemeMode(theme) ? theme : DEFAULT_THEME_MODE);
  }, [theme, setMode]);

  // A user who has not chosen a zone gets the browser's, so "today" and the planner match the clock they see.
  const adopted = useRef(false);
  const unsaved = query.data !== undefined && !query.data.saved;
  const savedZone = query.data?.timeZone;
  useEffect(() => {
    if (!unsaved || adopted.current) return;
    adopted.current = true;
    const detected = detectTimeZone();
    if (detected !== savedZone) mutate({ timeZone: detected });
  }, [unsaved, savedZone, mutate]);

  const update = useCallback(
    async (changes: SettingsChanges): Promise<SaveOutcome> => {
      setSaveError(null);
      try {
        await mutateAsync(changes);
        return { ok: true };
      } catch (error) {
        const described = describeAuthError(error, { fields: FIELDS });
        const message = described.form ?? Object.values(described.fields ?? {})[0] ?? MESSAGES.generic;
        setSaveError(message);
        return { ok: false, message };
      }
    },
    [mutateAsync],
  );

  // What applies until the server answers: no theme choice, the browser's zone, the default week.
  const fallback = useMemo<Settings>(() => ({ theme: DEFAULT_THEME_MODE, timeZone: detectTimeZone(), weekStart: 'monday', saved: false }), []);
  const settings = query.data ?? fallback;
  const loadError = query.isError ? (describeAuthError(query.error).form ?? MESSAGES.generic) : null;

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      status: query.isPending ? 'loading' : query.isError ? 'error' : 'ready',
      loadError,
      retry: () => void refetch(),
      saving: mutation.isPending,
      saveError,
      update,
    }),
    [settings, query.isPending, query.isError, refetch, loadError, mutation.isPending, saveError, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
