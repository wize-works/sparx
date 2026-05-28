import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@sparx/ui',
    '@sparx/auth',
    '@sparx/db',
    '@sparx/crm',
    '@sparx/crm-schemas',
    '@sparx/cms-editor',
    '@sparx/cms-schemas',
  ],
  serverExternalPackages: ['@prisma/client', 'better-auth'],
  typedRoutes: true,
};

export default config;
