/**
 * /api/data/status
 */
import { Hono } from 'hono';
import type { AppDeps, AppEnv } from '../types';
import { requireAuth } from '../auth/middleware';
import { dataStatus } from '../services/dataStatus';

export function dataRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.get('/status', requireAuth, (c) => c.json(dataStatus(deps.clock.now())));
  return app;
}
