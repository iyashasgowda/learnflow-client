import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type Conversation = components['schemas']['Conversation'];
export type ChatMessage = components['schemas']['Message'];
export type SendResult = components['schemas']['SendMessageResponse'];

const json = (method: 'POST' | 'PATCH', payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const base = `${API_PREFIX}/conversations`;
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const listConversations = (signal?: AbortSignal): Promise<{ items: Conversation[] }> =>
  apiFetch<{ items: Conversation[] }>(base, signal ? { signal } : {});

export const createConversation = (): Promise<Conversation> => apiFetch<Conversation>(base, json('POST', {}));

export const renameConversation = (id: string, title: string): Promise<Conversation> => apiFetch<Conversation>(one(id), json('PATCH', { title }));

export const deleteConversation = (id: string): Promise<void> => apiFetch<void>(one(id), { method: 'DELETE' });

export const listMessages = (id: string, signal?: AbortSignal): Promise<{ items: ChatMessage[] }> =>
  apiFetch<{ items: ChatMessage[] }>(`${one(id)}/messages`, signal ? { signal } : {});

export const clearConversation = (id: string): Promise<void> => apiFetch<void>(`${one(id)}/messages`, { method: 'DELETE' });

// The key makes a retry safe: the server stores a message once and answers it once.
export const sendMessage = (id: string, content: string, idempotencyKey: string): Promise<SendResult> =>
  apiFetch<SendResult>(`${one(id)}/messages`, json('POST', { content, idempotencyKey }));
