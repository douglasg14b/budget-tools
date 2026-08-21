import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// biome-ignore lint/style/noDefaultExport: Vite expects a default export from this config file.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:4020',
                changeOrigin: true,
            },
        },
    },
});
