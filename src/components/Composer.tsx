import { useState, type KeyboardEvent } from 'react';
import { CHAT_LIMITS } from '../constants';

interface Props {
  // Why sending is not possible right now, shown as the field's hint; null when it is.
  blockedReason: string | null;
  sending: boolean;
  onSend: (text: string) => void;
}

export function Composer({ blockedReason, sending, onSend }: Props) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending && blockedReason === null;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line; Enter while an input method is composing text belongs to it.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      className="composer"
      aria-label="Write a message"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="composer-input" className="visually-hidden">
        Message
      </label>
      <textarea
        id="composer-input"
        rows={2}
        value={text}
        maxLength={CHAT_LIMITS.messageMax}
        disabled={blockedReason !== null}
        placeholder="Ask a question. Enter to send, Shift+Enter for a new line."
        aria-describedby={blockedReason ? 'composer-hint' : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-row">
        <span id="composer-hint" className="text-muted">
          {blockedReason ?? (text.length >= CHAT_LIMITS.counterFrom ? `${text.length} / ${CHAT_LIMITS.messageMax}` : '')}
        </span>
        <button type="submit" className="button" disabled={!canSend}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
