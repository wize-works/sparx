import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ['@sparx/ui', '@sparx/cms-editor'],
  typedRoutes: false,
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../../'),
};

export default config;
