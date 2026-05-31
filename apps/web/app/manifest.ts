import type { MetadataRoute } from 'next';

// PWA manifest for the marketing site. Served at /manifest.webmanifest and
// auto-linked by Next from the metadata layer. The android-chrome icons live
// in apps/web/public/.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sparx',
    short_name: 'Sparx',
    description: 'A modular commerce operating system by WizeWorks.',
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
