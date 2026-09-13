import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { scanicNativeEsmPlugin } from './scanicVitePlugin';

// biome-ignore lint/style/noDefaultExport: Vite expects a default export from this config file.
export default defineConfig({
    plugins: [react(), basicSsl(), scanicNativeEsmPlugin()],
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
