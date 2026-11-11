import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `pnpm dev` runs this on 5173 and `wrangler dev` on 8787; /api goes to the Worker.
// The Worker only accepts saves from its own origin, so the proxy presents
// requests as coming from there.
const target = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        headers: { origin: target },
      },
    },
  },
});
