/**
 * Base Case API server entry point.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from './boot';
import { createApp } from './app';
import { bootstrap } from './seed';

const t0 = Date.now();
const { deps, conn, config, logger } = await boot();
await bootstrap(deps);
const app = createApp(deps);

if (config.env === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(here, '../dist');
  const indexFile = path.join(distDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    const rel = path.relative(process.cwd(), distDir) || '.';
    app.use('*', serveStatic({ root: rel }));
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api')) return c.json({ error: 'Not found', code: 'not_found' }, 404);
      return c.html(fs.readFileSync(indexFile, 'utf8'));
    });
    logger.info('serving static frontend', { dir: distDir });
  } else {
    logger.warn('NODE_ENV=production but ../dist/index.html not found; run `npm run build` first', { dir: distDir });
  }
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: process.env.HOST || undefined }, (info) => {
  logger.info('listening', {
    port: info.port,
    env: config.env,
    db: conn.kind,
    assistant: config.anthropicApiKey ? 'claude' : 'offline',
    appOrigin: config.appOrigin,
    startupMs: Date.now() - t0,
  });
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down', { signal });
  server.close(() => {
    conn.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
