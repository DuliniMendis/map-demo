import { useCallback, useSyncExternalStore } from 'react';

/** Below this width the side panel becomes a bottom sheet (matches `ui.css`). */
export const SHEET_QUERY = '(max-width: 899.98px)';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const get = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, get, () => false);
}
