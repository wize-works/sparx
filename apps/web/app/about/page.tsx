import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'About WizeWorks — Sparx',
  description:
    'WizeWorks is a Visalia, California software studio. Sparx is our flagship commerce platform. kanNINJA and HelpNinja are also ours.',
  alternates: { canonical: '/about' },
  robots: { index: false },
};

export default function AboutPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Company"
        title="About WizeWorks"
        description="WizeWorks is a Visalia, California software studio founded by Brandon Korous. Sparx is our flagship commerce platform; kanNINJA (project management) and HelpNinja (AI support) are also ours. wize.works for the full portfolio."
        contact="hello@sparx.works"
      />
      <Footer />
    </>
  );
}
