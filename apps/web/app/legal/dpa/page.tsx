import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Data processing agreement — Sparx',
  description:
    'GDPR/CCPA-compliant DPA for merchants processing EU and California customer data.',
  alternates: { canonical: '/legal/dpa' },
  robots: { index: false },
};

export default function DpaPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Legal"
        title="Data processing agreement"
        description="GDPR Article 28 and CCPA-compliant DPA for merchants processing EU and California customer data. Available for signature on request; auto-attached to Enterprise contracts."
        contact="legal@sparx.works"
      />
      <Footer />
    </>
  );
}
