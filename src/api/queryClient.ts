import { QueryClient } from '@tanstack/react-query';

// No automatic retries: errors are shown with a Retry button, so the user stays in control.
export const createQueryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
