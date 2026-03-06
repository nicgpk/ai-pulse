import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ── RSS Proxy middleware (dev only) ───────────────────────────
// In production (Vercel), api/proxy.js handles this route.
function rssProxyPlugin() {
  return {
    name: 'rss-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/proxy')) return next();

        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
        const target = new URLSearchParams(qs).get('url');

        if (!target) {
          res.writeHead(400).end('Missing url parameter');
          return;
        }

        try {
          const upstream = await fetch(target, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Pulse/1.0)' },
            signal: AbortSignal.timeout(8000),
          });
          const body = await upstream.text();
          res.writeHead(upstream.ok ? 200 : upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'text/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(body);
        } catch {
          res.writeHead(502).end('Proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), rssProxyPlugin()],
  server: {
    port: 3000,
    open: true,
  },
})
