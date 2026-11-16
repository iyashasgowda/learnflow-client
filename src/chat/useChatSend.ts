import { useRef, useState } from 'react';
import { ApiError, NetworkError } from '../api/client';
import { sendMessage } from '../api/chat';
import { MESSAGES, NOT_RETRYABLE_CODES } from '../constants';
import { noticeForError } from './availability';
import { useRefreshChat } from './hooks';

export interface PendingSend {
  key: string;
  content: string;
  status: 'sending' | 'failed';
  error: string | null;
  retryable: boolean;
}

// Why the assistant cannot be used right now, learned from a failed send.
export type AiNotice = { kind: 'unconfigured' } | { kind: 'budget' } | { kind: 'quota'; resetsAt: number | null };

const KEY_BYTES = 16;
const HEX_RADIX = 16;

const without = (all: Record<string, PendingSend>, id: string): Record<string, PendingSend> =>
  Object.fromEntries(Object.entries(all).filter(([key]) => key !== id));

// Works on plain http too, where crypto.randomUUID is not available.
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(2, '0')).join('');
}

function describeFailure(error: unknown): { message: string; retryable: boolean; notice: AiNotice | null } {
  if (error instanceof ApiError) {
    return { message: error.message, retryable: !NOT_RETRYABLE_CODES.includes(error.code), notice: noticeForError(error) };
  }
  if (error instanceof NetworkError) return { message: error.message, retryable: true, notice: null };
  return { message: MESSAGES.generic, retryable: true, notice: null };
}

// One send at a time per conversation; a failed send keeps its key so Retry can never store the message twice.
export function useChatSend() {
  const refresh = useRefreshChat();
  const [pending, setPending] = useState<Record<string, PendingSend>>({});
  const [notice, setNotice] = useState<AiNotice | null>(null);
  const inFlight = useRef(new Set<string>());

  const send = async (conversationId: string, content: string, key: string = newIdempotencyKey()) => {
    if (inFlight.current.has(conversationId)) return;
    inFlight.current.add(conversationId);
    setPending((all) => ({ ...all, [conversationId]: { key, content, status: 'sending', error: null, retryable: false } }));
    try {
      await sendMessage(conversationId, content, key);
      setPending((all) => without(all, conversationId));
      setNotice(null);
    } catch (error) {
      const failure = describeFailure(error);
      setPending((all) => ({ ...all, [conversationId]: { key, content, status: 'failed', error: failure.message, retryable: failure.retryable } }));
      if (failure.notice) setNotice(failure.notice);
    } finally {
      inFlight.current.delete(conversationId);
      // A failed send may still have stored the message, so the thread is always reloaded.
      await Promise.all([refresh.messages(conversationId), refresh.conversations()]);
    }
  };

  const dismiss = (conversationId: string) => setPending((all) => without(all, conversationId));

  return { pending, notice, send, dismiss };
}
