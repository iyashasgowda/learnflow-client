import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../api/chat';
import type { PendingSend } from '../chat/useChatSend';
import { Markdown } from './Markdown';

interface Props {
  messages: ChatMessage[];
  pending: PendingSend | undefined;
  onRetry: (key: string, content: string) => void;
  onDismiss: () => void;
}

interface RetryTarget {
  key: string;
  content: string;
  error: string | null;
  retryable: boolean;
}

function Bubble({ message }: { message: Pick<ChatMessage, 'role' | 'content'> }) {
  return (
    <li className={`bubble bubble-${message.role}`}>
      <p className="bubble-role">{message.role === 'user' ? 'You' : 'Assistant'}</p>
      {message.role === 'user' ? <p className="bubble-text">{message.content}</p> : <Markdown text={message.content} />}
    </li>
  );
}

export function MessageThread({ messages, pending, onRetry, onDismiss }: Props) {
  const end = useRef<HTMLDivElement>(null);
  const sending = pending?.status === 'sending';
  const stored = new Set(messages.map((message) => message.idempotencyKey).filter(Boolean));
  // Shown from the local copy until the server's copy of the same message arrives.
  const localOnly = pending && !stored.has(pending.key) ? pending : null;
  const last = messages.at(-1);

  let target: RetryTarget | null = null;
  if (pending?.status === 'failed') {
    target = { key: pending.key, content: pending.content, error: pending.error, retryable: pending.retryable };
  } else if (!sending && last?.role === 'user' && last.idempotencyKey) {
    target = { key: last.idempotencyKey, content: last.content, error: null, retryable: true };
  }

  const itemCount = messages.length + (localOnly ? 1 : 0) + (sending ? 1 : 0);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [itemCount]);

  return (
    <div className="thread" role="log" aria-label="Conversation" aria-live="polite">
      <ul className="bubbles">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {localOnly && <Bubble message={{ role: 'user', content: localOnly.content }} />}
      </ul>
      {sending && (
        <p role="status" className="thinking">
          Assistant is writing…
        </p>
      )}
      {target && (
        <div role="alert" className="notice">
          <p>{target.error ? `The assistant could not reply. ${target.error}` : 'This message has no reply yet.'}</p>
          <div className="button-row">
            {target.retryable && (
              <button type="button" className="button" onClick={() => onRetry(target.key, target.content)}>
                Retry
              </button>
            )}
            {pending?.status === 'failed' && (
              <button type="button" className="button button-quiet" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
