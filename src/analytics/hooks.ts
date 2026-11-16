import { useQuery } from '@tanstack/react-query';
import { getAnalytics, listActivity, type AnalyticsRange } from '../api/analytics';

// Keyed by range so each selection is cached; every figure on the page comes from one response.
export const useAnalytics = (range: AnalyticsRange) => useQuery({ queryKey: ['analytics', range], queryFn: ({ signal }) => getAnalytics(range, signal) });

export const useActivity = (limit: number) => useQuery({ queryKey: ['activity', limit], queryFn: ({ signal }) => listActivity(limit, signal) });
