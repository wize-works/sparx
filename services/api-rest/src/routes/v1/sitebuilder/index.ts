// Mounts every /v1/sitebuilder/* admin route group behind one registration.

import type { FastifyPluginAsync } from 'fastify';

import themeRoutes from './theme.js';
import savedThemeRoutes from './saved-themes.js';
import pageLayoutRoutes from './page-layouts.js';
import sectionRoutes from './sections.js';
import layoutRoutes from './layout.js';
import publishRoutes from './publish.js';

const sitebuilderRoutes: FastifyPluginAsync = async (app) => {
  await app.register(themeRoutes);
  await app.register(savedThemeRoutes);
  await app.register(pageLayoutRoutes);
  await app.register(sectionRoutes);
  await app.register(layoutRoutes);
  await app.register(publishRoutes);
};

export default sitebuilderRoutes;
