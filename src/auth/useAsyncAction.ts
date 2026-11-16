import { useRef, useState } from 'react';

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

// Runs one async action at a time: a second call while one is running is ignored.
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  // The ref blocks a repeat that arrives before the state update has rendered.
  const inFlight = useRef(false);

  const run = async <T>(action: () => Promise<T>): Promise<ActionResult<T> | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      return { ok: false, error };
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { pending, run };
}
