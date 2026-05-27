import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Marketplace — Sparx',
  description:
    'Themes, plugins, and integrations from the Sparx community. The marketplace lights up with v1.1, after the billing pipeline is stress-tested in the wild.',
  alternates: { canonical: '/marketplace' },
  robots: { index: false },
};

export default function MarketplacePage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Platform"
        title="Marketplace"
        description="Themes, plugins, and connectors from the Sparx community. Hosted on sparx.market once the billing and revenue-share pipeline is stress-tested in production — targeted for v1.1."
      />
      <Footer />
    </>
  );
}
