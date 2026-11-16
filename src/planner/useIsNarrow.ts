import { useSyncExternalStore } from 'react';

const NARROW_QUERY = '(max-width: 639px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const snapshot = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;

// True on a phone-sized screen, where the planner shows an agenda instead of the week.
export const useIsNarrow = (): boolean => useSyncExternalStore(subscribe, snapshot, () => false);
