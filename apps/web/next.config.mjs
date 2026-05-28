import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ['@sparx/ui'],
  typedRoutes: true,
  // Standalone output for Docker — produces .next/standalone with a minimal
  // node_modules and a server.js entrypoint.
  output: 'standalone',
  // Monorepo: tell Next.js to trace files starting at the repo root so
  // workspace deps (@sparx/ui) are included in the standalone bundle.
  outputFileTracingRoot: join(__dirname, '../../'),
  redirects: () =>
    Promise.resolve([
      // /pricing is the natural shareable URL; the actual content is the
      // pricing section on the home page.
      { source: '/pricing', destination: '/#pricing', permanent: false },
    ]),
};

export default config;
