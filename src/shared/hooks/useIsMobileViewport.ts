import { useSyncExternalStore } from 'react';

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

type ViewportQueryStore = {
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

const viewportQueryStores = new Map<number, ViewportQueryStore>();

function getQuery(maxWidth: number): string {
  return `(max-width: ${maxWidth}px)`;
}

function getSnapshot(maxWidth: number, mediaQuery?: MediaQueryList | null): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (mediaQuery) {
    return mediaQuery.matches;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(getQuery(maxWidth)).matches;
  }

  return window.innerWidth <= maxWidth;
}

function createViewportQueryStore(maxWidth: number): ViewportQueryStore {
  const listeners = new Set<() => void>();

  let mediaQuery: LegacyMediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? (window.matchMedia(getQuery(maxWidth)) as LegacyMediaQueryList)
      : null;
  let removeFallbackResizeListener: (() => void) | null = null;
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  function detach() {
    if (mediaQuery?.removeEventListener) {
      mediaQuery.removeEventListener('change', notify);
    } else if (mediaQuery?.removeListener) {
      mediaQuery.removeListener(notify);
    }

    removeFallbackResizeListener?.();
    removeFallbackResizeListener = null;
  }

  function attach() {
    if (typeof window === 'undefined') {
      return;
    }

    if (!mediaQuery && typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia(getQuery(maxWidth)) as LegacyMediaQueryList;
    }

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', notify);
      return;
    }

    if (mediaQuery?.addListener) {
      mediaQuery.addListener(notify);
      return;
    }

    window.addEventListener('resize', notify);
    removeFallbackResizeListener = () => window.removeEventListener('resize', notify);
  }

  return {
    getSnapshot: () => getSnapshot(maxWidth, mediaQuery),
    subscribe: (listener) => {
      if (!listeners.size) {
        attach();
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);

        if (!listeners.size) {
          detach();
          viewportQueryStores.delete(maxWidth);
        }
      };
    },
  };
}

function getViewportQueryStore(maxWidth: number): ViewportQueryStore {
  const existing = viewportQueryStores.get(maxWidth);

  if (existing) {
    return existing;
  }

  const nextStore = createViewportQueryStore(maxWidth);
  viewportQueryStores.set(maxWidth, nextStore);

  return nextStore;
}

export function useIsMobileViewport(maxWidth = 720): boolean {
  const store = getViewportQueryStore(maxWidth);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}

export function resetViewportQueryStoresForTests(): void {
  if (typeof window === 'undefined') {
    viewportQueryStores.clear();
    return;
  }

  viewportQueryStores.clear();
}
