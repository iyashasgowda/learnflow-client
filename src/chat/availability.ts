import type { ApiError } from '../api/client';
import { ERROR_CODES } from '../constants';
import type { AiNotice } from './useChatSend';

export interface Availability {
  aiConfigured: boolean | undefined;
  emailVerified: boolean;
  notice: AiNotice | null;
}

// What an answer from the server says about whether the assistant can be used at all.
export function noticeForError(error: ApiError): AiNotice | null {
  switch (error.code) {
    case ERROR_CODES.AI_NOT_CONFIGURED:
      return { kind: 'unconfigured' };
    case ERROR_CODES.AI_BUDGET_PAUSED:
      return { kind: 'budget' };
    case ERROR_CODES.AI_QUOTA_EXCEEDED: {
      const resetsAt = Date.parse(String(error.details?.resetsAt));
      return { kind: 'quota', resetsAt: Number.isNaN(resetsAt) ? null : resetsAt };
    }
    default:
      return null;
  }
}

// The reason, if any, the composer cannot be used. The banners and the disabled state both follow this.
export function blockedReasonFor({ aiConfigured, emailVerified, notice }: Availability, now: number = Date.now()): string | null {
  if (!emailVerified) return 'Verify your email address to use the assistant.';
  if (aiConfigured === false || notice?.kind === 'unconfigured') return 'The assistant is not available on this server.';
  if (notice?.kind === 'budget') return 'The assistant is paused for today.';
  if (notice?.kind === 'quota' && (notice.resetsAt === null || notice.resetsAt > now)) return 'You have used your daily assistant requests.';
  return null;
}

export interface AiBlockerMessages {
  notVerified: string;
  notConfigured: string;
  paused: string;
  quota: string;
}

export interface Blocker {
  message: string;
  // When the daily allowance returns; null when unknown or not a quota problem.
  resetsAt: number | null;
}

// Like blockedReasonFor, with the wording of one feature (summaries, quizzes) and the quota reset time.
export function aiBlockerFor(messages: AiBlockerMessages, { aiConfigured, emailVerified, notice }: Availability, now: number = Date.now()): Blocker | null {
  if (!emailVerified) return { message: messages.notVerified, resetsAt: null };
  if (aiConfigured === false || notice?.kind === 'unconfigured') return { message: messages.notConfigured, resetsAt: null };
  if (notice?.kind === 'budget') return { message: messages.paused, resetsAt: null };
  if (notice?.kind === 'quota' && (notice.resetsAt === null || notice.resetsAt > now)) return { message: messages.quota, resetsAt: notice.resetsAt };
  return null;
}
