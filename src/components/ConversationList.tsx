import { useState, type FormEvent } from 'react';
import type { Conversation } from '../api/chat';
import { CHAT_LIMITS } from '../constants';

interface Props {
  items: Conversation[];
  activeId: string | null;
  busy: boolean;
  renameError: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onClear: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}

export function ConversationList({ items, activeId, busy, renameError, onSelect, onNew, onRename, onClear, onDelete }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const submitRename = async (event: FormEvent, id: string) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    if (await onRename(id, title)) setEditing(null);
  };

  return (
    <nav className="conversations" aria-label="Conversations">
      <button type="button" className="button" onClick={onNew} disabled={busy}>
        New conversation
      </button>
      {items.length === 0 && <p className="text-muted">No conversations yet. Start one to ask your first question.</p>}
      <ul className="conversation-list">
        {items.map((conversation) => {
          const active = conversation.id === activeId;
          return (
            <li key={conversation.id} className={`conversation${active ? ' conversation-active' : ''}`}>
              {editing === conversation.id ? (
                <form onSubmit={(event) => void submitRename(event, conversation.id)} aria-label={`Rename: ${conversation.title}`}>
                  <label htmlFor="rename-input" className="visually-hidden">
                    New title
                  </label>
                  <input id="rename-input" value={draft} maxLength={CHAT_LIMITS.titleMax} onChange={(event) => setDraft(event.target.value)} autoFocus />
                  {renameError && (
                    <p role="alert" className="field-error">
                      {renameError}
                    </p>
                  )}
                  <div className="button-row">
                    <button type="submit" className="button" disabled={draft.trim().length === 0}>
                      Save
                    </button>
                    <button type="button" className="button button-quiet" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button type="button" className="conversation-title" aria-current={active ? 'true' : undefined} onClick={() => onSelect(conversation.id)}>
                    {conversation.title}
                  </button>
                  {active && (
                    <div className="conversation-actions">
                      <button
                        type="button"
                        className="button button-quiet"
                        aria-label={`Rename: ${conversation.title}`}
                        onClick={() => {
                          setDraft(conversation.title);
                          setEditing(conversation.id);
                        }}
                      >
                        Rename
                      </button>
                      <button type="button" className="button button-quiet" aria-label={`Clear: ${conversation.title}`} onClick={() => onClear(conversation)}>
                        Clear
                      </button>
                      <button type="button" className="button button-quiet" aria-label={`Delete: ${conversation.title}`} onClick={() => onDelete(conversation)}>
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
