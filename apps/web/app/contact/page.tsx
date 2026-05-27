import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Contact — Sparx',
  description:
    'Sales, support, partnerships, press. Pick the right address or just write hello@sparx.works.',
  alternates: { canonical: '/contact' },
  robots: { index: false },
};

export default function ContactPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Company"
        title="Contact"
        description="Sales (sales@), enterprise (enterprise@), press (press@), security (security@), or just hello@sparx.works for anything else. A real human reads every message. We answer within one business day."
        contact="hello@sparx.works"
      />
      <Footer />
    </>
  );
}
