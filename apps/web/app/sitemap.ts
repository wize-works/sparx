import type { MetadataRoute } from 'next';
import { MODULE_ORDER, MODULES } from '@/lib/modules';
import { listModules } from '@/lib/sparx-content';

const BASE = 'https://sparx.works';

// Sitemap is CMS-driven: pulls the list of published `module` entries from
// the marketing tenant. Falls back to the static MODULE_ORDER if api-rest
// is unreachable so a backend blip can't black-hole the sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  let slugs: { slug: string; lastModified: Date }[];
  try {
    const fetched = await listModules();
    slugs = fetched.length
      ? fetched.map((m) => ({ slug: m.slug, lastModified: now }))
      : staticSlugs(now);
  } catch {
    slugs = staticSlugs(now);
  }

  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...slugs.map(({ slug, lastModified }) => ({
      url: `${BASE}/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}

function staticSlugs(now: Date): { slug: string; lastModified: Date }[] {
  return MODULE_ORDER.map((key) => ({ slug: MODULES[key].slug, lastModified: now }));
}
