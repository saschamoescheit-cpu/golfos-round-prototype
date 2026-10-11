import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // map library is > 2 MB
        runtimeCaching: [
          {
            // Satellite tiles: keep what the player has seen, so the map works with poor reception on the course.
            urlPattern: /^https:\/\/(server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery|tms-pnoa-ma\.idee\.es\/1\.0\.0\/pnoa-ma)\//,
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
