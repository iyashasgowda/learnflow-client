import { createContext, useContext } from 'react';
import type { Settings, SettingsChanges } from '../api/settings';

export type SaveOutcome = { ok: true } | { ok: false; message: string };

export interface SettingsContextValue {
  // The settings in effect: what the server has, with a change shown at once while it is being saved.
  settings: Settings;
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  retry: () => void;
  saving: boolean;
  // Why the last change could not be saved; cleared by the next change.
  saveError: string | null;
  // Applies a change at once and puts the previous value back if the server refuses it.
  update: (changes: SettingsChanges) => Promise<SaveOutcome>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}

// Null outside the signed-in app, where there are no saved settings.
export const useOptionalSettings = (): SettingsContextValue | null => useContext(SettingsContext);
