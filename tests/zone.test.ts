import { describe, expect, it } from 'vitest';
import {
  addDays,
  detectTimeZone,
  formatDateTime,
  formatDay,
  formatTime,
  fromZonedLocal,
  isValidTimeZone,
  localDate,
  localTime,
  startOfLocalDay,
  supportedTimeZones,
  weekDates,
  weekStartOf,
} from '../src/time/zone';

const at = (iso: string) => new Date(iso);

describe('zones', () => {
  it('knows which zone names are real', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    for (const bad of ['', '  ', 'Mars/Olympus', 'Paris', '../x']) expect(isValidTimeZone(bad)).toBe(false);
  });

  it('detects a usable browser zone', () => {
    expect(isValidTimeZone(detectTimeZone())).toBe(true);
  });

  it('lists the known zones with UTC first among equals, sorted and without duplicates', () => {
    const zones = supportedTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/New_York');
    expect(new Set(zones).size).toBe(zones.length);
    expect([...zones].sort()).toEqual(zones);
  });

  it('tells the local date and time of an instant', () => {
    const instant = at('2030-06-15T03:30:00.000Z');
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2030-06-14');
    expect(localTime(instant, 'America/Los_Angeles')).toBe('20:30');
    expect(localDate(instant, 'Asia/Tokyo')).toBe('2030-06-15');
    expect(localTime(instant, 'Asia/Tokyo')).toBe('12:30');
    expect(localTime(at('2030-06-15T00:05:00.000Z'), 'UTC')).toBe('00:05');
  });
});

describe('startOfLocalDay', () => {
  it('is local midnight as a UTC instant, across daylight saving', () => {
    expect(startOfLocalDay('2030-06-15', 'America/New_York').toISOString()).toBe('2030-06-15T04:00:00.000Z');
    expect(startOfLocalDay('2030-03-10', 'America/New_York').toISOString()).toBe('2030-03-10T05:00:00.000Z');
    expect(startOfLocalDay('2030-03-11', 'America/New_York').toISOString()).toBe('2030-03-11T04:00:00.000Z');
    expect(startOfLocalDay('2030-06-15', 'Asia/Kathmandu').toISOString()).toBe('2030-06-14T18:15:00.000Z');
  });

  it('starts a day whose midnight does not exist at its first instant', () => {
    expect(startOfLocalDay('2030-03-10', 'America/Havana').toISOString()).toBe('2030-03-10T05:00:00.000Z');
  });
});

describe('fromZonedLocal', () => {
  it('turns a wall-clock time in the zone into the right instant', () => {
    expect(fromZonedLocal('2030-06-15', '09:00', 'America/New_York')?.toISOString()).toBe('2030-06-15T13:00:00.000Z');
    expect(fromZonedLocal('2030-01-15', '09:00', 'America/New_York')?.toISOString()).toBe('2030-01-15T14:00:00.000Z');
    expect(fromZonedLocal('2030-06-15', '09:00', 'Asia/Tokyo')?.toISOString()).toBe('2030-06-15T00:00:00.000Z');
    expect(fromZonedLocal('2030-06-15', '09:00', 'UTC')?.toISOString()).toBe('2030-06-15T09:00:00.000Z');
    expect(fromZonedLocal('2030-06-15', '00:00', 'Asia/Kathmandu')?.toISOString()).toBe('2030-06-14T18:15:00.000Z');
  });

  it('round-trips with localDate and localTime', () => {
    const instant = fromZonedLocal('2030-09-20', '17:45', 'Europe/Paris') as Date;
    expect(localDate(instant, 'Europe/Paris')).toBe('2030-09-20');
    expect(localTime(instant, 'Europe/Paris')).toBe('17:45');
  });

  it('says a time skipped by the clock change does not exist', () => {
    expect(fromZonedLocal('2030-03-10', '02:30', 'America/New_York')).toBeNull();
    expect(fromZonedLocal('2030-03-10', '03:00', 'America/New_York')?.toISOString()).toBe('2030-03-10T07:00:00.000Z');
    expect(fromZonedLocal('2030-03-10', '01:59', 'America/New_York')?.toISOString()).toBe('2030-03-10T06:59:00.000Z');
  });

  it('uses the first occurrence of a time that happens twice', () => {
    // 01:30 on 3 November 2030 happens at 05:30Z (summer time) and again at 06:30Z (winter time).
    expect(fromZonedLocal('2030-11-03', '01:30', 'America/New_York')?.toISOString()).toBe('2030-11-03T05:30:00.000Z');
    expect(fromZonedLocal('2030-11-03', '02:30', 'America/New_York')?.toISOString()).toBe('2030-11-03T07:30:00.000Z');
  });
});

describe('weeks', () => {
  it('finds the first day of the week containing a date, for each week start', () => {
    // 2030-06-15 is a Saturday.
    expect(weekStartOf('2030-06-15', 'monday')).toBe('2030-06-10');
    expect(weekStartOf('2030-06-15', 'sunday')).toBe('2030-06-09');
    expect(weekStartOf('2030-06-15', 'saturday')).toBe('2030-06-15');
    expect(weekStartOf('2030-06-10', 'monday')).toBe('2030-06-10');
    expect(weekStartOf('2030-06-16', 'monday')).toBe('2030-06-10');
    expect(weekStartOf('2030-06-16', 'sunday')).toBe('2030-06-16');
  });

  it('lists seven consecutive days across a month end', () => {
    expect(weekDates('2030-06-27')).toEqual(['2030-06-27', '2030-06-28', '2030-06-29', '2030-06-30', '2030-07-01', '2030-07-02', '2030-07-03']);
    expect(addDays('2030-03-01', -1)).toBe('2030-02-28');
  });
});

describe('formatting', () => {
  it('shows an instant in the given zone', () => {
    const instant = '2030-06-15T13:00:00.000Z';
    expect(formatTime(instant, 'America/New_York')).toMatch(/9:00\s?AM/);
    expect(formatTime(instant, 'Asia/Tokyo')).toMatch(/10:00\s?PM/);
    expect(formatDateTime(instant, 'Asia/Tokyo')).toContain('Jun 15, 2030');
    expect(formatDateTime('2030-06-15T23:30:00.000Z', 'Asia/Tokyo')).toContain('Jun 16, 2030');
  });

  it('shows a calendar date without drifting to another day', () => {
    expect(formatDay('2030-06-15')).toBe('Sat, Jun 15');
    expect(formatDay('2030-01-01')).toBe('Tue, Jan 1');
  });
});
