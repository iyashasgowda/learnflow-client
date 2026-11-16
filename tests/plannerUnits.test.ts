import { describe, expect, it } from 'vitest';
import type { StudySession } from '../src/api/sessions';
import { emptySessionForm, formFieldsFromServer, formFromSession, groupByDay, overlappingIds, sortSessions, validateSessionForm, type SessionFormValues } from '../src/planner/schedule';

const session = (id: string, startsAt: string, endsAt: string, overrides: Partial<StudySession> = {}): StudySession => ({
  id,
  title: id,
  startsAt,
  endsAt,
  materialId: null,
  taskId: null,
  createdAt: '2030-06-01T00:00:00.000Z',
  updatedAt: '2030-06-01T00:00:00.000Z',
  ...overrides,
});

describe('sortSessions', () => {
  it('orders by start, then end, then id, and leaves the input alone', () => {
    const input = [
      session('d', '2030-06-12T10:00:00.000Z', '2030-06-12T11:00:00.000Z'),
      session('c', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z'),
      session('b', '2030-06-12T09:00:00.000Z', '2030-06-12T09:30:00.000Z'),
      session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T09:30:00.000Z'),
      session('z', '2030-06-11T09:00:00.000Z', '2030-06-11T10:00:00.000Z'),
    ];
    const before = input.map((item) => item.id);
    const sorted = sortSessions(input);
    expect(sorted.map((item) => item.id)).toEqual(['z', 'a', 'b', 'c', 'd']);
    expect(input.map((item) => item.id)).toEqual(before);
    expect(sorted).not.toBe(input);
  });

  it('gives the same order however the input is arranged', () => {
    const items = [session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z'), session('b', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z'), session('c', '2030-06-12T08:00:00.000Z', '2030-06-12T08:30:00.000Z')];
    const expected = sortSessions(items).map((item) => item.id);
    expect(sortSessions([...items].reverse()).map((item) => item.id)).toEqual(expected);
    expect(sortSessions([items[1] as StudySession, items[2] as StudySession, items[0] as StudySession]).map((item) => item.id)).toEqual(expected);
  });

  it('handles an empty list and a frozen array', () => {
    expect(sortSessions([])).toEqual([]);
    expect(sortSessions(Object.freeze([session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z')]))).toHaveLength(1);
  });
});

describe('overlappingIds', () => {
  it('finds sessions that overlap another, and only those', () => {
    const ids = overlappingIds([
      session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T10:30:00.000Z'),
      session('b', '2030-06-12T10:00:00.000Z', '2030-06-12T11:00:00.000Z'),
      session('c', '2030-06-12T13:00:00.000Z', '2030-06-12T14:00:00.000Z'),
    ]);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('does not count sessions that only touch', () => {
    expect(overlappingIds([session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z'), session('b', '2030-06-12T10:00:00.000Z', '2030-06-12T11:00:00.000Z')]).size).toBe(0);
  });

  it('finds a long session that overlaps several later ones', () => {
    const ids = overlappingIds([
      session('long', '2030-06-12T08:00:00.000Z', '2030-06-12T14:00:00.000Z'),
      session('x', '2030-06-12T09:00:00.000Z', '2030-06-12T09:30:00.000Z'),
      session('y', '2030-06-12T12:00:00.000Z', '2030-06-12T13:00:00.000Z'),
      session('after', '2030-06-12T15:00:00.000Z', '2030-06-12T16:00:00.000Z'),
    ]);
    expect([...ids].sort()).toEqual(['long', 'x', 'y']);
  });

  it('finds identical sessions, whatever order they arrive in', () => {
    const a = session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z');
    const b = session('b', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z');
    expect([...overlappingIds([b, a])].sort()).toEqual(['a', 'b']);
  });

  it('is empty for no sessions or one', () => {
    expect(overlappingIds([]).size).toBe(0);
    expect(overlappingIds([session('a', '2030-06-12T09:00:00.000Z', '2030-06-12T10:00:00.000Z')]).size).toBe(0);
  });
});

describe('groupByDay', () => {
  const days = ['2030-06-10', '2030-06-11', '2030-06-12', '2030-06-13', '2030-06-14', '2030-06-15', '2030-06-16'];

  it('puts each session under the local day it starts on, in order', () => {
    // 02:00 UTC on the 12th is the evening of the 11th in New York.
    const groups = groupByDay(
      [session('late', '2030-06-12T20:00:00.000Z', '2030-06-12T21:00:00.000Z'), session('evening', '2030-06-12T02:00:00.000Z', '2030-06-12T03:00:00.000Z'), session('early', '2030-06-12T13:00:00.000Z', '2030-06-12T14:00:00.000Z')],
      days,
      'America/New_York',
    );
    expect(groups.map((group) => group.date)).toEqual(days);
    expect(groups.find((group) => group.date === '2030-06-11')?.sessions.map((item) => item.id)).toEqual(['evening']);
    expect(groups.find((group) => group.date === '2030-06-12')?.sessions.map((item) => item.id)).toEqual(['early', 'late']);
    expect(groups.filter((group) => group.sessions.length === 0)).toHaveLength(5);
  });

  it('shows a session that began before the week under the first day', () => {
    const groups = groupByDay([session('carry', '2030-06-09T22:00:00.000Z', '2030-06-10T06:00:00.000Z')], days, 'UTC');
    expect(groups[0]?.sessions.map((item) => item.id)).toEqual(['carry']);
  });
});

describe('the session form', () => {
  const NY = 'America/New_York';
  const form = (overrides: Partial<SessionFormValues> = {}): SessionFormValues => ({ ...emptySessionForm('2030-06-12'), title: 'Revise cells', ...overrides });

  it('starts with a sensible hour on the chosen day', () => {
    expect(emptySessionForm('2030-06-12')).toEqual({ title: '', startDate: '2030-06-12', startTime: '09:00', endDate: '2030-06-12', endTime: '10:00', materialId: '', taskId: '' });
  });

  it('turns a valid form into UTC instants using the user\'s zone', () => {
    expect(validateSessionForm(form(), NY)).toEqual({ ok: true, request: { title: 'Revise cells', startsAt: '2030-06-12T13:00:00.000Z', endsAt: '2030-06-12T14:00:00.000Z', materialId: null, taskId: null } });
    expect(validateSessionForm(form(), 'Asia/Tokyo')).toMatchObject({ ok: true, request: { startsAt: '2030-06-12T00:00:00.000Z' } });
  });

  it('trims the title and sends links', () => {
    expect(validateSessionForm(form({ title: '  Revise  ', materialId: 'm-1', taskId: 't-1' }), NY)).toMatchObject({ ok: true, request: { title: 'Revise', materialId: 'm-1', taskId: 't-1' } });
  });

  it('allows a session that ends the next day, and exactly 12 hours', () => {
    expect(validateSessionForm(form({ startTime: '23:00', endDate: '2030-06-13', endTime: '01:00' }), NY).ok).toBe(true);
    expect(validateSessionForm(form({ startTime: '08:00', endTime: '20:00' }), NY).ok).toBe(true);
  });

  it.each([
    ['a blank title', { title: '   ' }, 'title', 'Enter a title.'],
    ['a title that is too long', { title: 'x'.repeat(201) }, 'title', 'Use at most 200 characters.'],
    ['a missing start date', { startDate: '' }, 'start', 'Enter a valid start date and time.'],
    ['a missing start time', { startTime: '' }, 'start', 'Enter a valid start date and time.'],
    ['a missing end time', { endTime: '' }, 'end', 'Enter a valid end date and time.'],
    ['a malformed date', { endDate: '12/06/2030' }, 'end', 'Enter a valid end date and time.'],
    ['an end equal to the start', { endTime: '09:00' }, 'end', 'The end must be after the start.'],
    ['an end before the start', { endTime: '08:00' }, 'end', 'The end must be after the start.'],
    ['a session over 12 hours', { startTime: '08:00', endTime: '20:01' }, 'end', 'A session can last at most 12 hours.'],
  ])('rejects %s, naming the field', (_label, patch, field, message) => {
    const result = validateSessionForm(form(patch), NY);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[field]).toBe(message);
  });

  it('reports every problem at once', () => {
    const result = validateSessionForm(form({ title: '', startDate: '', endTime: '' }), NY);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['end', 'start', 'title']);
  });

  it('refuses a time the clock skips when daylight saving starts', () => {
    const result = validateSessionForm(form({ startDate: '2030-03-10', endDate: '2030-03-10', startTime: '02:30', endTime: '03:30' }), NY);
    expect(!result.ok && result.errors.start).toContain('does not exist');
  });

  it('measures the length of a session across a clock change in real time', () => {
    // 01:00 to 14:00 on the 23-hour day is 12 real hours, so it is allowed; 01:00 to 14:30 is not.
    expect(validateSessionForm(form({ startDate: '2030-03-10', endDate: '2030-03-10', startTime: '01:00', endTime: '14:00' }), NY).ok).toBe(true);
    expect(validateSessionForm(form({ startDate: '2030-03-10', endDate: '2030-03-10', startTime: '01:00', endTime: '14:30' }), NY).ok).toBe(false);
  });

  it('fills the form from a session in the user\'s zone', () => {
    const values = formFromSession(session('s', '2030-06-12T13:00:00.000Z', '2030-06-12T14:30:00.000Z', { title: 'Revise', materialId: 'm-1' }), NY);
    expect(values).toEqual({ title: 'Revise', startDate: '2030-06-12', startTime: '09:00', endDate: '2030-06-12', endTime: '10:30', materialId: 'm-1', taskId: '' });
    expect(validateSessionForm(values, NY)).toMatchObject({ ok: true, request: { startsAt: '2030-06-12T13:00:00.000Z', endsAt: '2030-06-12T14:30:00.000Z' } });
  });

  it('shows a session that crosses midnight with its own end date', () => {
    expect(formFromSession(session('s', '2030-06-13T03:00:00.000Z', '2030-06-13T05:00:00.000Z'), NY)).toMatchObject({ startDate: '2030-06-12', startTime: '23:00', endDate: '2030-06-13', endTime: '01:00' });
  });

  it('renames the server\'s time fields to the form\'s', () => {
    expect(formFieldsFromServer({ title: 'a', startsAt: 'b', endsAt: 'c', materialId: 'd' })).toEqual({ title: 'a', start: 'b', end: 'c', materialId: 'd' });
    expect(formFieldsFromServer({})).toEqual({});
  });
});
