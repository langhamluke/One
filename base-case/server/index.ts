/**
 * Base Case API server entry point.
 */
import { serve } from '@hono/node-server';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from './boot';
import { createApp } from './app';
import { bootstrap } from './seed';
import { productConfig } from '../shared/product';

const t0 = Date.now();
const { deps, conn, config, logger } = await boot().catch((err: unknown) => {
  // Startup failures (missing master key in production, unreachable DATABASE_URL) exit with a clear line, not a stack dump.
  console.error(`[base-case] startup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
await bootstrap(deps);
const app = createApp(deps);

if (config.env === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(here, '../dist');
  const indexFile = path.join(distDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    const rel = path.relative(process.cwd(), distDir) || '.';
    // The build may have been made for either product; stamp this instance's product, icon and title on the page so
    // the first paint is right. Registered before the static handler, which would otherwise serve index.html as is.
    const icon = config.product === 'base-case' ? 'favicon' : `favicon-${config.product}`;
    const page = fs
      .readFileSync(indexFile, 'utf8')
      .replace(/data-product="[a-z-]+"/, `data-product="${config.product}"`)
      .replace(/href="\/favicon[a-z-]*\.svg"/, `href="/${icon}.svg"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${productConfig(config.product).name}</title>`);
    const sendPage = (c: Context) => c.html(page);
    app.get('/', sendPage);
    app.get('/index.html', sendPage);
    app.use('*', serveStatic({ root: rel }));
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api')) return c.json({ error: 'Not found', code: 'not_found' }, 404);
      return sendPage(c);
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

server.on('error', (err: NodeJS.ErrnoException) => {
  logger.error('server error', { code: err.code ?? 'unknown', message: err.message, port: config.port });
  process.exit(1);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down', { signal });
  // Drop keep-alive connections so close() does not wait on idle clients.
  (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  server.close(() => {
    conn.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
