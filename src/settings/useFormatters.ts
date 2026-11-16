import { useCallback } from 'react';
import { formatDateTime, formatTime, detectTimeZone } from '../time/zone';
import { useOptionalSettings } from './settingsContext';

// Dates and times as the user's own time zone shows them; the browser's zone before settings are known.
export function useFormatters() {
  const configured = useOptionalSettings()?.settings.timeZone;
  const timeZone = configured ?? detectTimeZone();
  const dateTime = useCallback((instant: string | Date) => formatDateTime(instant, timeZone), [timeZone]);
  const time = useCallback((instant: string | number | Date) => formatTime(instant, timeZone), [timeZone]);
  return { timeZone, dateTime, time };
}
