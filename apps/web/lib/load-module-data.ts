// Data-only module loader. Same fetch + fallback shape as load-module.tsx
// but with zero React/DOM imports so the edge-runtime OG and Twitter image
// routes can import it without dragging react-dom into their bundles.

import type { MarketingModule } from '@/components/marketing/primitives';
import { MODULES, type ModuleMeta } from '@/lib/modules';
import { getModule } from '@/lib/sparx-content';

export async function loadModuleData(
  slug: MarketingModule,
  previewToken?: string
): Promise<ModuleMeta> {
  try {
    const fetched = await getModule(slug, previewToken ? { previewToken } : {});
    if (!fetched) return MODULES[slug];
    return {
      slug: fetched.slug,
      module: slug,
      label: fetched.meta.label,
      headlinePrimary: fetched.meta.headlinePrimary,
      headlineSecondary: fetched.meta.headlineSecondary,
      title: fetched.meta.title,
      description: fetched.meta.description,
      lede: fetched.meta.lede,
      features: fetched.features,
      pricing: {
        price: fetched.meta.pricing.price,
        period: fetched.meta.pricing.period,
        modifier: fetched.meta.pricing.modifier === 'additive' ? '+' : '',
        bundleNote: fetched.meta.pricing.bundleNote,
      },
      ...(fetched.meta.marketingDomain
        ? { marketingDomain: fetched.meta.marketingDomain.replace(/^https?:\/\//, '') }
        : {}),
    };
  } catch {
    return MODULES[slug];
  }
}
