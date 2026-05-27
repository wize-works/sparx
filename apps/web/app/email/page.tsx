import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ModulePage } from '@/components/marketing/module-page';
import { MODULES } from '@/lib/modules';

const meta = MODULES.email;

export const metadata: Metadata = {
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

export default function EmailPage() {
  return (
    <>
      <Nav />
      <ModulePage meta={meta} />
      <Footer />
    </>
  );
}
