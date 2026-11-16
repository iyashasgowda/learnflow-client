import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generateSummary, getSummary } from '../api/summaries';
import type { Summary } from '../api/summaries';

const summaryKey = (materialId: string) => ['summary', materialId] as const;

export const useSummary = (materialId: string) =>
  useQuery({ queryKey: summaryKey(materialId), queryFn: ({ signal }) => getSummary(materialId, signal) });

// A failed run leaves the cached summary alone, so the previous one stays on screen.
export function useGenerateSummary(materialId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generateSummary(materialId),
    onSuccess: (summary: Summary) => queryClient.setQueryData(summaryKey(materialId), summary),
  });
}
