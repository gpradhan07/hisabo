"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/** Measures an element; pair with an absolutely positioned box so the size never feeds back into layout. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setSize({ width, height });
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}


/**
 * The current time, refreshed every `intervalMs`. The server (and the prerendered shell) sees a fixed
 * epoch; the browser switches to the real clock on hydration, so no time is baked into the build.
 */
export function useTicker(intervalMs: number) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  const bucket = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs),
    () => 0,
  );
  // Start of the current interval: pure, and precise enough for "today" and "synced 5s ago".
  return useMemo(() => new Date(bucket * intervalMs), [bucket, intervalMs]);
}
