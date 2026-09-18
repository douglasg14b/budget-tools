import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { scanicNativeEsmPlugin } from './scanicVitePlugin';

// biome-ignore lint/style/noDefaultExport: Vite expects a default export from this config file.
export default defineConfig({
    plugins: [
        react(),
        basicSsl(),
        scanicNativeEsmPlugin(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/budget-tools.svg', 'icons/apple-touch-icon.png'],
            manifest: {
                id: '/',
                name: 'Budget Tools',
                short_name: 'Budget Tools',
                description: 'Review receipts and keep transaction categories organized.',
                theme_color: '#161712',
                background_color: '#161712',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                categories: ['finance', 'utilities'],
                icons: [
                    {
                        src: '/icons/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: '/icons/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: '/icons/pwa-maskable-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                cleanupOutdatedCaches: true,
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api(?:\/|$)/],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                        handler: 'NetworkOnly',
                    },
                ],
            },
        }),
    ],
    server: {
        // Listen on LAN so a phone on the same Wi-Fi can open the printed Network URL.
        // HTTPS is required for in-app getUserMedia outside localhost.
        host: true,
        port: 5173,
        proxy: {
            // 127.0.0.1 avoids Windows resolving localhost to IPv6 ::1 and refusing the IPv4 API.
            '/api': {
                target: 'http://127.0.0.1:4020',
                changeOrigin: true,
                timeout: 300_000,
                proxyTimeout: 300_000,
            },
        },
    },
});
