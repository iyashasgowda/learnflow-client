import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTask, deleteTask, getDashboardSummary, listTasks, updateTask, type NewTask, type TaskListParams, type TaskPatch } from '../api/tasks';

// Every task change also refreshes the dashboard, so counts always match the list.
const TASKS_KEY = ['tasks'] as const;
const SUMMARY_KEY = ['dashboard', 'summary'] as const;

export const useTasks = (params: TaskListParams) =>
  useQuery({
    queryKey: [...TASKS_KEY, params],
    queryFn: ({ signal }) => listTasks(params, signal),
    // Keeps the old page on screen while the next one loads, so filters and paging do not flash.
    placeholderData: keepPreviousData,
  });

export const useDashboardSummary = () =>
  useQuery({ queryKey: SUMMARY_KEY, queryFn: ({ signal }) => getDashboardSummary(signal) });

function useRefreshAfter() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: TASKS_KEY }), queryClient.invalidateQueries({ queryKey: SUMMARY_KEY })]);
}

export function useCreateTask() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (task: NewTask) => createTask(task), onSuccess: refresh });
}

export function useUpdateTask() {
  const refresh = useRefreshAfter();
  // A failed edit (for example a version conflict) also refreshes, so the list shows the truth.
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => updateTask(id, patch),
    onSettled: refresh,
  });
}

export function useDeleteTask() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (id: string) => deleteTask(id), onSuccess: refresh });
}
