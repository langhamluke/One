/**
 * createApp(deps): the Hono application (used by index.ts and the tests).
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppDeps, AppEnv } from './types';
import { HttpError } from './errors';
import { csrf, loadSession, requestContext, requireMfaIfEnabled, securityHeaders } from './auth/middleware';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { clientRoutes } from './routes/clients';
import { planRoutes } from './routes/plans';
import { proposalRoutes } from './routes/proposals';
import { chatRoutes } from './routes/chat';
import { dataRoutes } from './routes/data';
import { getSetting } from './services/settings';
import { productConfig } from '../shared/product';
import type { ProductInfo } from '../shared/api';

export const BODY_LIMIT_BYTES = 512 * 1024;

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', requestContext(deps));
  app.use('*', securityHeaders(deps.config.appOrigin));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      const res = c.json({ error: err.message, code: err.code }, err.status as 400);
      for (const [k, v] of Object.entries(err.headers ?? {})) res.headers.set(k, v);
      return res;
    }
    deps.logger.error('unhandled error', { reqId: c.get('reqId'), errorClass: err?.constructor?.name ?? 'Error', message: String(err?.message ?? '').slice(0, 200) });
    return c.json({ error: 'Internal server error', code: 'internal' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not found', code: 'not_found' }, 404));

  const api = new Hono<AppEnv>();
  api.use('*', bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError: (c) => c.json({ error: 'Request body too large', code: 'body_too_large' }, 413) }));
  api.use('*', csrf(deps.config.appOrigin, deps.config.trustProxy));
  api.use('*', loadSession(deps));
  api.use('*', requireMfaIfEnabled);

  api.get('/health', (c) => c.json({ ok: true, time: deps.clock.now().toISOString(), db: deps.dbKind, product: deps.config.product, assistant: deps.config.anthropicApiKey ? 'claude' : 'offline' }));
  // Public product descriptor (name, tagline, firm) so the sign-in page can brand itself before any session exists.
  api.get('/product', async (c) => {
    const p = productConfig(deps.config.product);
    const firmName = await getSetting(deps, 'firmName');
    const res: ProductInfo = { key: p.key, name: p.name, tagline: p.tagline, firmName };
    return c.json(res);
  });
  api.route('/', authRoutes(deps));
  api.route('/admin', adminRoutes(deps));
  api.route('/clients', clientRoutes(deps));
  api.route('/plans', planRoutes(deps));
  api.route('/proposals', proposalRoutes(deps));
  api.route('/chat', chatRoutes(deps));
  api.route('/data', dataRoutes(deps));

  app.route('/api', api);
  // Unknown API paths are a JSON 404 even when a static frontend is mounted after this (production).
  app.all('/api/*', (c) => c.json({ error: 'Not found', code: 'not_found' }, 404));
  return app;
}

export type App = ReturnType<typeof createApp>;
