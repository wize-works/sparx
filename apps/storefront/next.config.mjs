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
  images: {
    // Media is served via api-rest's redirecting /v1/public/media endpoint, so
    // we drive next/image through a custom loader rather than the built-in
    // optimizer (which can't process a 302). See lib/image-loader.ts.
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
  },
};

export default config;
