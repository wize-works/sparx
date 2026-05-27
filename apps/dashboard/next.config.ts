import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sparx/ui', '@sparx/auth', '@sparx/db'],
  serverExternalPackages: ['@prisma/client', 'better-auth'],
  typedRoutes: true,
};

export default config;
