import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

function evaluateMediaQuery(query: string): boolean {
  const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);

  if (maxWidthMatch) {
    return window.innerWidth <= Number(maxWidthMatch[1]);
  }

  const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);

  if (minWidthMatch) {
    return window.innerWidth >= Number(minWidthMatch[1]);
  }

  return false;
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: evaluateMediaQuery(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
