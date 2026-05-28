// GET /health — Kubernetes probe target.
//
// Returns 200 with a tiny JSON body so liveness/readiness probes can also
// tail the response in logs if needed. No auth (whitelisted in api-core's
// auth plugin), no envelope (probes don't read it).

import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = (app) => {
  app.get('/health', () => ({ status: 'ok', service: 'api-graphql' }));
  return Promise.resolve();
};

export default healthRoutes;
