// Mounts every /v1/email/* management route group. One register call from
// app.ts so the email URL space lives behind a single registration point.
// (The legacy test-send routes stay registered separately in app.ts.)

import type { FastifyPluginAsync } from 'fastify';

import emailSettingsRoutes from './settings.js';
import emailDomainRoutes from './domains.js';
import emailSuppressionRoutes from './suppressions.js';

const emailRoutes: FastifyPluginAsync = async (app) => {
  await app.register(emailSettingsRoutes);
  await app.register(emailDomainRoutes);
  await app.register(emailSuppressionRoutes);
};

export default emailRoutes;
