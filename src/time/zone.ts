// Time zone arithmetic with Intl only: sessions are stored as UTC instants and shown, and entered, in the user's own zone.

const DEFAULT_ZONE = 'UTC';
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const SCAN_BACK_HOURS = 30;
const DAYS_PER_WEEK = 7;

export type WeekStart = 'monday' | 'sunday' | 'saturday';
const WEEK_START_DAY: Record<WeekStart, number> = { sunday: 0, monday: 1, saturday: 6 };

const parts = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = parts.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    parts.set(zone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone.trim() !== '';
  } catch {
    return false;
  }
}

// The zone the browser is set to; UTC if it cannot tell.
export function detectTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

// Every zone the browser knows, plus UTC, for the settings list.
export function supportedTimeZones(): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set([DEFAULT_ZONE, ...known])).sort();
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, zone: string): WallClock {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(zone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return { year: values.year as number, month: values.month as number, day: values.day as number, hour: values.hour as number, minute: values.minute as number, second: values.second as number };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

export function localDate(instant: Date, zone: string): string {
  const { year, month, day } = wallClock(instant, zone);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

// HH:MM on the 24-hour clock in the zone.
export function localTime(instant: Date, zone: string): string {
  const { hour, minute } = wallClock(instant, zone);
  return `${pad(hour)}:${pad(minute)}`;
}

function offsetMs(instant: Date, zone: string): number {
  const { year, month, day, hour, minute, second } = wallClock(instant, zone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant.getTime() / 1000) * 1000;
}

const splitDate = (date: string): [number, number, number] => {
  const [year, month, day] = date.split('-').map(Number);
  return [year as number, month as number, day as number];
};

export function addDays(date: string, days: number): string {
  const [year, month, day] = splitDate(date);
  return new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// The first instant of the calendar date in the zone.
export function startOfLocalDay(date: string, zone: string): Date {
  const [year, month, day] = splitDate(date);
  const guess = Date.UTC(year, month - 1, day);
  let candidate = guess - offsetMs(new Date(guess), zone);
  candidate = guess - offsetMs(new Date(candidate), zone);
  const isStart = (at: number) => localDate(new Date(at), zone) === date && localDate(new Date(at - MS_PER_MINUTE), zone) !== date;
  if (isStart(candidate)) return new Date(candidate);

  let hour = guess - SCAN_BACK_HOURS * MS_PER_HOUR;
  while (localDate(new Date(hour), zone) !== date) hour += MS_PER_HOUR;
  let minute = hour;
  while (localDate(new Date(minute - MS_PER_MINUTE), zone) === date) minute -= MS_PER_MINUTE;
  return new Date(minute);
}

// The instant a wall-clock date and time (YYYY-MM-DD and HH:MM) mean in the zone. Null when that time never happens there (the hour skipped when clocks go forward); when it happens twice (clocks go back) the first one is used.
export function fromZonedLocal(date: string, time: string, zone: string): Date | null {
  const [year, month, day] = splitDate(date);
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set([offsetMs(new Date(wanted - MS_PER_DAY), zone), offsetMs(new Date(wanted + MS_PER_DAY), zone)]);
  const valid = [...offsets]
    .map((offset) => wanted - offset)
    .filter((candidate) => localDate(new Date(candidate), zone) === date && localTime(new Date(candidate), zone) === time)
    .sort((a, b) => a - b);
  return valid[0] === undefined ? null : new Date(valid[0]);
}

// The first day of the week containing the date.
export function weekStartOf(date: string, weekStart: WeekStart): string {
  const [year, month, day] = splitDate(date);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((dayOfWeek - WEEK_START_DAY[weekStart] + DAYS_PER_WEEK) % DAYS_PER_WEEK));
}

export const weekDates = (first: string): string[] => Array.from({ length: DAYS_PER_WEEK }, (_, index) => addDays(first, index));

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
function dateTimeFormat(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let format = dateTimeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(undefined, options);
    dateTimeFormats.set(key, format);
  }
  return format;
}

export const formatDateTime = (instant: string | Date, zone: string): string =>
  dateTimeFormat(`dt:${zone}`, { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant));

export const formatTime = (instant: string | number | Date, zone: string): string => dateTimeFormat(`t:${zone}`, { timeZone: zone, timeStyle: 'short' }).format(new Date(instant));

// A calendar date (YYYY-MM-DD) as words, with no time zone involved.
export const formatDay = (date: string): string => dateTimeFormat('d', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00Z`));

export const formatLongDay = (date: string): string => dateTimeFormat('ld', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
