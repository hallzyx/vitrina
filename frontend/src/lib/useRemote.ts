import { useCallback, useEffect, useRef, useState } from "react";

export interface Remote<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Loads again (keeps the current data visible while it does). */
  reload: () => void;
}

/**
 * Loads data for a screen and exposes loading/error states. A newer load or an unmount cancels the
 * older one, so a late answer never overwrites fresher data.
 */
export function useRemote<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): Remote<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loader
      .current(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err);
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
