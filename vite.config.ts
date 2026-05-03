import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: Vite compiles src/sw.ts and injects __WB_MANIFEST at
      // build time. skipWaiting + clientsClaim are now declared inside sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'apple-touch-icon.png', 'logo-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Replanish',
        short_name: 'Replanish',
        description: 'Family life, planned & shared — together',
        theme_color: '#c4522d',
        background_color: '#faf6ef',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // NOTE: no workbox block — that config is now in src/sw.ts
      devOptions: {
        // Keep SW active in dev so push + notificationclick can be tested
        // with the browser DevTools "Application → Service Workers" panel.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
