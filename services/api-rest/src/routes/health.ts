// Liveness + readiness probe (k8s/apps/api-rest.example.yaml both reference
// /health). Intentionally simple: no DB roundtrip, no auth, no envelope —
// just a 200 and a tiny body so kubelet can flip the pod healthy fast.
//
// A deeper /readyz endpoint (DB ping, Pub/Sub publisher warmup) lands when
// those dependencies are wired in; for now Fastify being up means the
// service is ready to serve.

import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = (app) => {
    app.get('/health', { logLevel: 'silent' }, () => ({
        status: 'ok',
        service: 'api-rest',
    }));
    return Promise.resolve();
};

export default healthRoutes;
