import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
const BACKEND = new URL('http://localhost:3000');
/** Run proxy before SPA fallback so /uploads and /curation hit the backend, not index.html. */
function proxyPrePlugin() {
    return {
        name: 'proxy-pre',
        enforce: 'pre',
        configureServer(server) {
            const handler = (req, res, next) => {
                const path = req.url ?? '';
                if (!path.startsWith('/uploads') && !path.startsWith('/curation'))
                    return next();
                const opts = {
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
            const stack = server.middlewares.stack;
            if (Array.isArray(stack))
                stack.unshift({ route: '', handle: handler });
            else
                server.middlewares.use(handler);
        },
    };
}
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
