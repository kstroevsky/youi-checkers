import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('../src', import.meta.url).pathname,
    },
  },
  test: {
    css: false,
    environment: 'node',
    include: ['scripts/domainPerformance.report.ts'],
    setupFiles: [],
  },
});
