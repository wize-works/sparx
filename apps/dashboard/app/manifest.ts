import type { MetadataRoute } from 'next';

// PWA manifest for the merchant dashboard. Served at /manifest.webmanifest and
// auto-linked by Next from the metadata layer. The android-chrome icons live
// in apps/dashboard/public/.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sparx Dashboard',
    short_name: 'Sparx',
    description: 'Merchant admin for the Sparx commerce platform.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6366f1',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
