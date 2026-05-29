// Catch-all page route. Joins the URL path segments with `/` and looks up
// a `page`-typed CMS entry with that slug under the tenant resolved from
// the Host header. Honors `?sparxPreview=<token>` for draft access.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveTenant } from '@/lib/tenant';
import { getPageBySlug } from '@/lib/content';
import { PageView } from '@/components/page-view';

export const dynamic = 'force-dynamic';

interface SlugPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<{ sparxPreview?: string }>;
}

function buildSlug(parts: string[]): string {
  return parts.map((p) => decodeURIComponent(p)).join('/');
}

export async function generateMetadata({ params, searchParams }: SlugPageProps): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) return {};
  const slug = buildSlug((await params).slug);
  const previewToken = (await searchParams)?.sparxPreview;
  const page = await getPageBySlug(tenant.slug, slug, previewToken ? { previewToken } : {});
  if (!page) return {};

  const seo = page.seo ?? {};
  const seoTitle = typeof seo.title === 'string' ? seo.title : undefined;
  const seoDescription = typeof seo.description === 'string' ? seo.description : undefined;
  const bodyTitle = typeof page.body.title === 'string' ? page.body.title : undefined;
  const title = seoTitle ?? bodyTitle ?? tenant.name;

  return {
    title,
    ...(seoDescription ? { description: seoDescription } : {}),
    robots: page.status === 'published' ? { index: true, follow: true } : { index: false },
  };
}

export default async function StorefrontPage({ params, searchParams }: SlugPageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const slug = buildSlug((await params).slug);
  const previewToken = (await searchParams)?.sparxPreview;
  const page = await getPageBySlug(tenant.slug, slug, previewToken ? { previewToken } : {});

  if (!page) notFound();

  return <PageView entry={page} />;
}
