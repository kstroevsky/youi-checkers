import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';

import packageJson from './package.json';

function getRelease(): string {
  const configuredSha =
    process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA;
  let commit = configuredSha?.slice(0, 7);

  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
        encoding: 'utf8',
      }).trim();
    } catch {
      commit = 'unknown';
    }
  }

  return `${packageJson.version}+${commit}`;
}

export default defineConfig({
  define: {
    __APP_RELEASE__: JSON.stringify(getRelease()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'YOUI',
        short_name: 'YOUI',
        description: 'Local-first board game with hot-seat play and optional browser AI.',
        display: 'standalone',
        theme_color: '#e8dfd2',
        background_color: '#f9f3e8',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/models/ai-policy-value.onnx',
            handler: 'CacheFirst',
            options: {
              cacheName: 'youi-ai-model',
              cacheableResponse: {
                statuses: [200, 206],
              },
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
