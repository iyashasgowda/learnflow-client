import { useState } from 'react';
import type { Conversation } from '../api/chat';
import { useAuth } from '../auth/authContext';
import { describeAuthError } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { blockedReasonFor } from '../chat/availability';
import { useAiConfigured, useClearConversation, useConversations, useCreateConversation, useDeleteConversation, useMessages, useRenameConversation } from '../chat/hooks';
import { useChatSend } from '../chat/useChatSend';
import { AiBanners } from '../components/AiBanners';
import { AiDisclosureGate } from '../components/AiDisclosureGate';
import { Composer } from '../components/Composer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ConversationList } from '../components/ConversationList';
import { MessageThread } from '../components/MessageThread';
import { MESSAGES } from '../constants';

type Confirming = { kind: 'clear' | 'delete'; conversation: Conversation } | null;

export function AssistantPage() {
  const { state } = useAuth();
  const emailVerified = state.status === 'authenticated' && state.user.emailVerified;
  const aiConfigured = useAiConfigured().data;

  const conversations = useConversations();
  const items = conversations.data?.items;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = items?.some((item) => item.id === selectedId) ? selectedId : (items?.[0]?.id ?? null);
  const messages = useMessages(activeId);

  const create = useCreateConversation();
  const rename = useRenameConversation();
  const clear = useClearConversation();
  const remove = useDeleteConversation();
  const createAction = useAsyncAction();
  const confirmAction = useAsyncAction();
  const chat = useChatSend();

  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const availability = { aiConfigured, emailVerified, notice: chat.notice };
  const blockedReason = blockedReasonFor(availability);
  const pending = activeId ? chat.pending[activeId] : undefined;

  const startConversation = async () => {
    setProblem(null);
    const result = await createAction.run(() => create.mutateAsync());
    if (!result) return;
    if (result.ok) setSelectedId(result.value.id);
    else setProblem(describeAuthError(result.error).form ?? MESSAGES.generic);
  };

  const renameTo = async (id: string, title: string): Promise<boolean> => {
    setRenameError(null);
    try {
      await rename.mutateAsync({ id, title });
      return true;
    } catch (error) {
      setRenameError(describeAuthError(error).form ?? MESSAGES.generic);
      return false;
    }
  };

  const closeDialog = () => {
    setConfirming(null);
    setConfirmError(null);
  };

  const confirm = async () => {
    if (!confirming) return;
    setConfirmError(null);
    const { kind, conversation } = confirming;
    const result = await confirmAction.run(() => (kind === 'clear' ? clear.mutateAsync(conversation.id) : remove.mutateAsync(conversation.id)));
    if (!result) return;
    if (result.ok) closeDialog();
    else setConfirmError(describeAuthError(result.error).form ?? MESSAGES.generic);
  };

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">AI Assistant</h1>
        <p>Ask questions and get study help. Conversations are saved to your account.</p>
        <AiBanners {...availability} />
      </section>

      <div className="assistant">
        <section className="card" aria-label="Your conversations" aria-busy={conversations.isFetching}>
          {conversations.isPending && <p role="status">Loading conversations…</p>}
          {conversations.isError && (
            <div role="alert" className="notice">
              <p>{describeAuthError(conversations.error).form ?? MESSAGES.generic}</p>
              <button type="button" className="button" onClick={() => void conversations.refetch()}>
                Retry
              </button>
            </div>
          )}
          {problem && (
            <p role="alert" className="field-error">
              {problem}
            </p>
          )}
          {items && (
            <ConversationList
              items={items}
              activeId={activeId}
              busy={createAction.pending}
              renameError={renameError}
              onSelect={setSelectedId}
              onNew={() => void startConversation()}
              onRename={renameTo}
              onClear={(conversation) => setConfirming({ kind: 'clear', conversation })}
              onDelete={(conversation) => setConfirming({ kind: 'delete', conversation })}
            />
          )}
        </section>

        <section className="card chat" aria-label="Chat">
          {items && !activeId && <p>Start a conversation to ask your first question.</p>}
          {activeId && messages.isLoading && <p role="status">Loading messages…</p>}
          {activeId && messages.isError && (
            <div role="alert" className="notice">
              <p>{describeAuthError(messages.error).form ?? MESSAGES.generic}</p>
              <button type="button" className="button" onClick={() => void messages.refetch()}>
                Retry
              </button>
            </div>
          )}
          {activeId && messages.data && (
            <>
              {messages.data.items.length === 0 && !pending && <p className="text-muted">No messages yet. Ask your first question below.</p>}
              <MessageThread
                messages={messages.data.items}
                pending={pending}
                onRetry={(key, content) => void chat.send(activeId, content, key)}
                onDismiss={() => chat.dismiss(activeId)}
              />
              <AiDisclosureGate>
                <Composer blockedReason={blockedReason} sending={pending?.status === 'sending'} onSend={(text) => void chat.send(activeId, text)} />
              </AiDisclosureGate>
            </>
          )}
        </section>
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming.kind === 'clear' ? 'Clear this conversation?' : 'Delete this conversation?'}
          confirmLabel={confirming.kind === 'clear' ? 'Clear messages' : 'Delete conversation'}
          pendingLabel={confirming.kind === 'clear' ? 'Clearing…' : 'Deleting…'}
          pending={confirmAction.pending}
          error={confirmError}
          onConfirm={confirm}
          onCancel={closeDialog}
        >
          <p>
            {confirming.kind === 'clear'
              ? `All messages in “${confirming.conversation.title}” will be removed. The conversation stays.`
              : `“${confirming.conversation.title}” and all its messages will be permanently deleted. This cannot be undone.`}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
