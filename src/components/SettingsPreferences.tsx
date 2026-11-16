import { useMemo, useState } from 'react';
import type { SettingsChanges } from '../api/settings';
import { useSettings } from '../settings/settingsContext';
import { isThemeMode } from '../theme/theme';
import { supportedTimeZones } from '../time/zone';

const WEEK_STARTS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' },
] as const;

type SaveState = { kind: 'idle' } | { kind: 'saved'; what: string } | { kind: 'failed'; message: string };

// Every control here changes something real: the theme, how times are shown, what counts as today, and the planner's week.
export function SettingsPreferences() {
  const { settings, status, loadError, retry, saving, update } = useSettings();
  const [result, setResult] = useState<SaveState>({ kind: 'idle' });
  const zones = useMemo(() => {
    const all = supportedTimeZones();
    return all.includes(settings.timeZone) ? all : [...all, settings.timeZone].sort();
  }, [settings.timeZone]);

  const save = async (changes: SettingsChanges, what: string) => {
    setResult({ kind: 'idle' });
    const outcome = await update(changes);
    setResult(outcome.ok ? { kind: 'saved', what } : { kind: 'failed', message: outcome.message });
  };

  return (
    <section className="card" aria-labelledby="preferences-heading" aria-busy={status === 'loading' || saving}>
      <h2 id="preferences-heading">Preferences</h2>

      {status === 'loading' && <p role="status">Loading your settings…</p>}
      {status === 'error' && (
        <div role="alert" className="notice">
          <p>{loadError}</p>
          <button type="button" className="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="form-field">
            <label htmlFor="setting-theme">Theme</label>
            <select
              id="setting-theme"
              value={settings.theme}
              disabled={saving}
              onChange={(event) => isThemeMode(event.target.value) && void save({ theme: event.target.value }, 'Theme')}
            >
              <option value="system">Same as my device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <p className="field-hint">Saved to your account, so it follows you to other devices.</p>
          </div>

          <div className="form-field">
            <label htmlFor="setting-time-zone">Time zone</label>
            <select id="setting-time-zone" value={settings.timeZone} disabled={saving} onChange={(event) => void save({ timeZone: event.target.value }, 'Time zone')}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <p className="field-hint">Decides which tasks are overdue, where each day starts in your statistics, and the times in the planner.</p>
          </div>

          <div className="form-field">
            <label htmlFor="setting-week-start">Week starts on</label>
            <select
              id="setting-week-start"
              value={settings.weekStart}
              disabled={saving}
              onChange={(event) => void save({ weekStart: event.target.value as (typeof WEEK_STARTS)[number]['value'] }, 'Week start')}
            >
              {WEEK_STARTS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
            <p className="field-hint">The first day of each week in the planner.</p>
          </div>

          {saving && <p role="status">Saving…</p>}
          {result.kind === 'saved' && !saving && <p role="status">{result.what} saved.</p>}
          {result.kind === 'failed' && (
            <p role="alert" className="form-error">
              Could not save: {result.message} Your previous setting is back.
            </p>
          )}
        </>
      )}
    </section>
  );
}
