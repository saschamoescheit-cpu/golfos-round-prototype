import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// hosts of the checked US imagery sources (public/imagery/us.json) – their tiles are kept like the others
const usHosts = (() => {
  try {
    const d = JSON.parse(readFileSync('public/imagery/us.json', 'utf-8')) as { sources: { tiles: string }[] };
    return [...new Set(d.sources.map((s) => new URL(s.tiles.replace(/\{[^}]+\}/g, '0')).host))];
  } catch {
    return [];
  }
})();

// base './' so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'GolfOS Rounds',
        short_name: 'GolfOS',
        description: 'GolfOS prototype – round tracking',
        theme_color: '#0E1418',
        background_color: '#0E1418',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        globIgnores: ['greens/**', 'mediapipe/**', 'models/**'], // green charts and the pose model load on demand (runtime cache below)
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // map library is > 2 MB
        runtimeCaching: [
          {
            // the pose model of the mobility screen (feature 030): ≈ 22 MB, only when a camera test is started, then kept
            urlPattern: /\/(mediapipe|models)\/[^/]+\.(wasm|js|task)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'pose-model', expiration: { maxEntries: 8 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // the list of US imagery sources (loaded for a course in the USA)
            urlPattern: /\/imagery\/[a-z]+\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'imagery-sources', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // tiles of the US state and county orthoimagery – kept for the course, as the other imagery
            urlPattern: ({ url }) => usHosts.includes(url.host),
            handler: 'CacheFirst',
            options: { cacheName: 'imagery-us', expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /\/greens\/.*\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'greens-v2', expiration: { maxEntries: 400 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // green heights for the putt read (feature 024) and the course height grid: offline on the course,
            // refreshed when online
            urlPattern: /\/greens\/.*\/(heights|terrain)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'green-heights', expiration: { maxEntries: 40 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Satellite tiles: keep what the player has seen, so the map works with poor reception on the course.
            urlPattern: /^https:\/\/(server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery|tms-pnoa-ma\.idee\.es\/1\.0\.0\/pnoa-ma|owsproxy\.lgl-bw\.de\/owsproxy\/ows\/WMS_LGL-BW_ATKIS_DOP_20_C)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'imagery',
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
