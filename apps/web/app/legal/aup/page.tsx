import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Acceptable use policy — Sparx',
  description: "What you can and can't do on Sparx — fraud, spam, illegal content, and prohibited industries.",
  alternates: { canonical: '/legal/aup' },
  robots: { index: false },
};

export default function AupPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Legal"
        title="Acceptable use policy"
        description="What you can and can't sell on Sparx. Short version: no fraud, no spam, no illegal content, no industries on the standard prohibited list (weapons, certain regulated goods). Full policy in legal review."
        contact="legal@sparx.works"
      />
      <Footer />
    </>
  );
}
