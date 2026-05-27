import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Terms of service — Sparx',
  description: 'Legal terms governing your use of the Sparx platform.',
  alternates: { canonical: '/legal/terms' },
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Legal"
        title="Terms of service"
        description="The legal terms governing your use of the Sparx platform. The full agreement is drafted and in legal review. Email legal@sparx.works for the current draft if you're evaluating Sparx for enterprise use."
        contact="legal@sparx.works"
      />
      <Footer />
    </>
  );
}
