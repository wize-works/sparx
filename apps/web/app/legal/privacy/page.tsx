import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Privacy policy — Sparx',
  description: "How we collect, use, and protect data — yours and your customers'.",
  alternates: { canonical: '/legal/privacy' },
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Legal"
        title="Privacy policy"
        description="How we collect, use, store, and protect data — yours, your merchants', and your merchants' customers'. GDPR and CCPA aligned. Full policy in legal review; current draft available on request."
        contact="privacy@sparx.works"
      />
      <Footer />
    </>
  );
}
