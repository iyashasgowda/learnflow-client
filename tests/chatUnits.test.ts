import { describe, expect, it } from 'vitest';
import { blockedReasonFor } from '../src/chat/availability';
import { newIdempotencyKey } from '../src/chat/useChatSend';

const NOW = Date.parse('2030-06-15T12:00:00.000Z');
const ok = { aiConfigured: true, emailVerified: true, notice: null };

describe('blockedReasonFor', () => {
  it('allows sending when everything is in order, and while AI status is still unknown', () => {
    expect(blockedReasonFor(ok, NOW)).toBeNull();
    expect(blockedReasonFor({ ...ok, aiConfigured: undefined }, NOW)).toBeNull();
  });

  it('blocks an unverified account first', () => {
    expect(blockedReasonFor({ aiConfigured: false, emailVerified: false, notice: { kind: 'budget' } }, NOW)).toMatch(/Verify your email/);
  });

  it('blocks when AI is not configured, from the health check or from an answer', () => {
    expect(blockedReasonFor({ ...ok, aiConfigured: false }, NOW)).toMatch(/not available/);
    expect(blockedReasonFor({ ...ok, notice: { kind: 'unconfigured' } }, NOW)).toMatch(/not available/);
  });

  it('blocks while the budget is paused', () => {
    expect(blockedReasonFor({ ...ok, notice: { kind: 'budget' } }, NOW)).toMatch(/paused/);
  });

  it('blocks until the quota resets, then allows sending again', () => {
    const later = { kind: 'quota' as const, resetsAt: NOW + 1000 };
    expect(blockedReasonFor({ ...ok, notice: later }, NOW)).toMatch(/daily assistant requests/);
    expect(blockedReasonFor({ ...ok, notice: later }, NOW + 1000)).toBeNull();
    expect(blockedReasonFor({ ...ok, notice: { kind: 'quota', resetsAt: null } }, NOW)).toMatch(/daily assistant requests/);
  });
});

describe('newIdempotencyKey', () => {
  it('makes long, URL-safe, unique keys that the server accepts', () => {
    const keys = Array.from({ length: 200 }, () => newIdempotencyKey());
    expect(new Set(keys).size).toBe(200);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
