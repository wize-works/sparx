import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Brand — Sparx',
  description:
    'The Sparx wordmark, color tokens, type scale, and usage rules. Press-ready brand kit available on request.',
  alternates: { canonical: '/brand' },
  robots: { index: false },
};

export default function BrandPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Company"
        title="Brand"
        description="The Sparx wordmark (the 'x' is always indigo), the module color system, the Geist type scale, and the usage rules that keep the whole thing coherent. Press-ready brand kit and high-resolution wordmark pack available on request."
        contact="brand@sparx.works"
      />
      <Footer />
    </>
  );
}
