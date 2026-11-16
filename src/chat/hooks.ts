import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getHealth } from '../api/client';
import { clearConversation, createConversation, deleteConversation, listConversations, listMessages, renameConversation } from '../api/chat';
import { HEALTH_STALE_MS } from '../constants';

const CONVERSATIONS_KEY = ['conversations'] as const;
const messagesKey = (id: string) => ['messages', id] as const;

export const useConversations = () => useQuery({ queryKey: CONVERSATIONS_KEY, queryFn: ({ signal }) => listConversations(signal) });

export const useMessages = (conversationId: string | null) =>
  useQuery({
    queryKey: messagesKey(conversationId ?? ''),
    queryFn: ({ signal }) => listMessages(conversationId as string, signal),
    enabled: conversationId !== null,
  });

// Whether the server has a provider key and model; sending is pointless when it does not.
export const useAiConfigured = () =>
  useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getHealth(signal), staleTime: HEALTH_STALE_MS, select: (health) => health.ai.configured });

export function useRefreshChat() {
  const queryClient = useQueryClient();
  return {
    conversations: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
    messages: (id: string) => queryClient.invalidateQueries({ queryKey: messagesKey(id) }),
  };
}

export function useCreateConversation() {
  const refresh = useRefreshChat();
  return useMutation({ mutationFn: createConversation, onSuccess: refresh.conversations });
}

export function useRenameConversation() {
  const refresh = useRefreshChat();
  return useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title), onSuccess: refresh.conversations });
}

export function useDeleteConversation() {
  const refresh = useRefreshChat();
  return useMutation({ mutationFn: (id: string) => deleteConversation(id), onSuccess: refresh.conversations });
}

export function useClearConversation() {
  const refresh = useRefreshChat();
  return useMutation({
    mutationFn: (id: string) => clearConversation(id),
    onSuccess: (_result, id) => Promise.all([refresh.messages(id), refresh.conversations()]),
  });
}
