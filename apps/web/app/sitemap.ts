import type { MetadataRoute } from 'next';
import { MODULE_ORDER, MODULES } from '@/lib/modules';

const BASE = 'https://sparx.works';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...MODULE_ORDER.map((key) => ({
      url: `${BASE}/${MODULES[key].slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
