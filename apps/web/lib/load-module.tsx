// Shared "load a marketing module page from the CMS" helper. Used by
// every /<module>/page.tsx route on the marketing site. Falls back to
// the hand-coded TS (lib/modules.ts) when the CMS is unreachable so a
// backend outage can't black-hole sparx.works.
//
// Each marketing route is a one-liner above this:
//
//   export const generateMetadata = makeMetadata('storefront');
//   export default makePage('storefront');
//
// When MODULES is finally deleted (CMS is the only source of truth),
// this file is the only place that needs to change.

import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ModulePage } from '@/components/marketing/module-page';
import type { MarketingModule } from '@/components/marketing/primitives';
import type { ModuleMeta } from '@/lib/modules';
import { loadModuleData } from '@/lib/load-module-data';

type ModuleKey = MarketingModule;

export interface MarketingPageProps {
  searchParams?: Promise<{ sparxPreview?: string }>;
}

export async function loadModuleMeta(slug: ModuleKey, previewToken?: string): Promise<ModuleMeta> {
  return loadModuleData(slug, previewToken);
}

export function makeMetadata(slug: ModuleKey) {
  return async function generateMetadata({
    searchParams,
  }: MarketingPageProps = {}): Promise<Metadata> {
    const token = (await searchParams)?.sparxPreview;
    const meta = await loadModuleMeta(slug, token);
    return {
      title: meta.title,
      description: meta.description,
      alternates: { canonical: `/${meta.slug}` },
      openGraph: {
        title: meta.title,
        description: meta.description,
        url: `https://sparx.works/${meta.slug}`,
        siteName: 'Sparx',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: meta.title,
        description: meta.description,
      },
    };
  };
}

export function makePage(slug: ModuleKey) {
  return async function ModulePageRoute({ searchParams }: MarketingPageProps = {}) {
    const token = (await searchParams)?.sparxPreview;
    const meta = await loadModuleMeta(slug, token);
    return (
      <>
        <Nav />
        <ModulePage meta={meta} />
        <Footer />
      </>
    );
  };
}
