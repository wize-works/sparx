import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ModulePage } from '@/components/marketing/module-page';
import { MODULES, type ModuleMeta } from '@/lib/modules';
import { getModule } from '@/lib/sparx-content';

// Marketing /cms — first route to read from the Sparx CMS via api-rest's
// public surface. Falls back to the hand-coded TS file
// (apps/web/lib/modules.ts) if the CMS call fails so a backend outage
// can't take the marketing site down.
//
// Once the remaining seven module routes are migrated (mechanical copy
// of this file with slug='storefront', 'commerce', …) we delete MODULES
// outright and the marketing site is fully headless.

async function loadModule(previewToken?: string): Promise<ModuleMeta> {
  try {
    const fetched = await getModule('cms', previewToken ? { previewToken } : {});
    if (!fetched) return MODULES.cms;
    return {
      slug: fetched.slug,
      module: 'cms',
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
    // CMS unreachable — fall back to the legacy TS. Logged downstream by
    // Fastify (apps/web doesn't have its own observability pipeline yet).
    return MODULES.cms;
  }
}

// Next.js 16 — searchParams is a Promise. We read `?sparxPreview=` here
// and feed it into loadModule so the page renders the draft version for
// the editor holding the token.
interface PageProps {
  searchParams?: Promise<{ sparxPreview?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps = {}): Promise<Metadata> {
  const token = (await searchParams)?.sparxPreview;
  const meta = await loadModule(token);
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
}

export default async function CmsPage({ searchParams }: PageProps = {}) {
  const token = (await searchParams)?.sparxPreview;
  const meta = await loadModule(token);
  if (!meta) notFound();
  return (
    <>
      <Nav />
      <ModulePage meta={meta} />
      <Footer />
    </>
  );
}
