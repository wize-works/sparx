import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Press — Sparx',
  description:
    'Press inquiries, founder bio, brand assets, hi-res screenshots.',
  alternates: { canonical: '/press' },
  robots: { index: false },
};

export default function PressPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Company"
        title="Press"
        description="Press inquiries, founder bio, brand assets, hi-res screenshots, and the latest Sparx announcements. We respond within one business day."
        contact="press@sparx.works"
      />
      <Footer />
    </>
  );
}
