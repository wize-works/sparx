import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Enterprise — Sparx',
  description:
    'Custom storefronts, dedicated support, SOC 2 audit assistance, contract terms tailored to your security and procurement requirements.',
  alternates: { canonical: '/enterprise' },
  robots: { index: false },
};

export default function EnterprisePage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Platform"
        title="Enterprise"
        description="Custom storefronts, dedicated support, SOC 2 audit assistance, 99.99% SLA with credits, and contract terms tailored to your security and procurement process. Gillett Diesel was our first Enterprise customer — yours could be next."
        contact="enterprise@sparx.works"
      />
      <Footer />
    </>
  );
}
