import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Every aerial service the map uses – Esri, Spain, Baden-Württemberg, the other German states (src/data/deImagery.json)
// and the checked US sources (public/imagery/us.json) – as patterns written out at build time. The service worker gets
// a pattern as it is: the function with an outer variable (usHosts) used before arrived there without it and threw on
// every request, so from 17.10. to 25.10.2026 no aerial tile was kept for offline (Sascha 25.10.: "Karte wird offline
// gespeichert bleibt hängen").
const hostsOf = (file: string): string[] => {
  try {
    const d = JSON.parse(readFileSync(file, 'utf-8')) as { sources: { tiles: string }[] };
    return d.sources.map((s) => new URL(s.tiles.replace(/\{[^}]+\}/g, '0')).host);
  } catch {
    return [];
  }
};
const hostPattern = (hosts: string[]) => new RegExp(`^https://(${[...new Set(hosts)].map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '-'})/`);
// only pictures go into the offline store – a service answering "200 OK" with an error page (LGL 23.–25.10.2026:
// "Dataset not found" as XML) would else stand there as the course map for 60 days. Written out into the service
// worker as it is, so it uses nothing from outside.
// A generic "application/octet-stream" (ArcGIS-hosted US services, 27.10.2026) counts by its first bytes: JPEG, PNG, GIF, WebP.
const picturesOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.type === 'opaque') return response;
    const type = response.headers.get('content-type') || 'image/';
    if (type.startsWith('image/')) return response;
    if (!/octet-stream/.test(type)) return null;
    const b = new Uint8Array(await response.clone().arrayBuffer()).subarray(0, 12);
    const pic = (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0x47 && b[1] === 0x49) || (b[0] === 0x52 && b[8] === 0x57);
    return pic ? response : null;
  },
};
const IMAGERY_PATTERN = hostPattern(['server.arcgisonline.com', 'tms-pnoa-ma.idee.es', 'owsproxy.lgl-bw.de', ...hostsOf('src/data/deImagery.json')]);
const US_IMAGERY_PATTERN = hostPattern(hostsOf('public/imagery/us.json'));

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
        // push notifications: shown and opened by public/push-sw.js (final list, Sascha 23.10.2026)
        importScripts: ['push-sw.js'],
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
            urlPattern: US_IMAGERY_PATTERN,
            handler: 'CacheFirst',
            options: { cacheName: 'imagery-us', expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] }, plugins: [picturesOnly] },
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
            urlPattern: IMAGERY_PATTERN,
            handler: 'CacheFirst',
            options: {
              cacheName: 'imagery',
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [picturesOnly],
            },
          },
        ],
      },
    }),
  ],
});
