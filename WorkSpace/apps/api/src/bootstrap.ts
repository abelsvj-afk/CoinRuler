/* Lightweight bootstrap to guarantee a /health endpoint even if main init fails */
import 'dotenv/config';

function resolvePort(): number {
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (process.env.PORT) return Number(process.env.PORT);
  if (!isProd && process.env.API_PORT) return Number(process.env.API_PORT);
  if (process.env.API_PORT) return Number(process.env.API_PORT);
  return 3001;
}

// Early global error handlers
process.on('uncaughtException', (err) => {
  try { console.error('[bootstrap] Uncaught exception:', err?.message || err); } catch {}
});
process.on('unhandledRejection', (reason) => {
  try { console.error('[bootstrap] Unhandled rejection:', (reason as any)?.message || reason); } catch {}
});

(async () => {
  try {
    // Attempt to load the full server; if successful, it will start listening itself
    // Using dynamic import to surface initialization errors here
    await import('./index');
    // If import succeeds, index.ts handles listen; nothing else to do.
  } catch (err: any) {
    const port = resolvePort();
    const express = (await import('express')).default;
    const app = express();
    const errorMsg = err?.stack || err?.message || String(err);
    console.error('[bootstrap] Failed to start full API, serving degraded /health only:', errorMsg);
    app.get('/', (_req, res) => res.type('text/plain').send('coinruler-api:degraded'));
    app.get('/health', (_req, res) => res.json({ ok: false, mode: 'degraded', error: errorMsg }));
    app.listen(port, '0.0.0.0', () => {
      console.log(`[bootstrap] Degraded health server listening on http://localhost:${port}/health`);
    });
  }
})();
