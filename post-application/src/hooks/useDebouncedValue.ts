import { useEffect, useState } from 'react';

/**
 * Returns `value` as it was once it stopped changing for `delayMs`.
 *
 * Search is typed one character at a time, and driving a request from the raw
 * input value spends one on every prefix the user was only passing through:
 * "j", "ja", "jam" are three round-trips for one intent, and the two the user
 * never wanted are the ones the server is busiest answering.
 *
 * Ordering is the sharper edge. Those requests finish in whatever order the
 * network hands them back, so the answer for "j" can land after the answer for
 * "jam" and leave the list showing results for a term that is no longer in the
 * box. Waiting for a pause means only the settled term is ever asked for, which
 * removes the race rather than papering over it with a sequence number — and it
 * keeps this hook honest for callers whose data layer does not key responses by
 * argument the way RTK Query does.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    // Cancelling the pending update on every change is what makes this a
    // debounce and not a throttle: a keystroke inside the window restarts the
    // clock instead of letting a half-typed term through.
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
