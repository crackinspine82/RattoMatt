import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
const BACKEND = new URL('http://localhost:3000');

/** Run proxy before SPA fallback so /uploads and /curation hit the backend, not index.html. */
function proxyPrePlugin() {
  return {
    name: 'proxy-pre',
    enforce: 'pre' as const,
    configureServer(server: { middlewares: ConnectApp }) {
      const handler = (req: any, res: any, next: () => void) => {
        const path = req.url ?? '';
        if (!path.startsWith('/uploads') && !path.startsWith('/curation')) return next();

        const opts: http.RequestOptions = {
          hostname: BACKEND.hostname,
          port: BACKEND.port || 80,
          path,
          method: req.method,
          headers: { ...req.headers, host: BACKEND.host },
        };
        const proxyReq = http.request(opts, (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res);
        });
        proxyReq.on('error', (err) => {
          console.error('[proxy-pre]', err);
          res.statusCode = 502;
          res.end('Bad Gateway');
        });
        req.pipe(proxyReq);
      };
      // Connect appends use() to the stack; unshift so we run first (before SPA fallback).
      const stack = (server.middlewares as ConnectApp & { stack: ConnectLayer[] }).stack;
      if (Array.isArray(stack)) stack.unshift({ route: '', handle: handler });
      else server.middlewares.use(handler);
    },
  };
}

type ConnectApp = { use: (fn: (req: any, res: any, next: () => void) => void) => void };
type ConnectLayer = { route: string; handle: (req: any, res: any, next: () => void) => void };

export default defineConfig({
  plugins: [proxyPrePlugin(), react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/curation': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
