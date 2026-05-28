import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Careers — Sparx',
  description:
    "We're hiring engineers, designers, and a customer success lead. Remote-first, Visalia or anywhere.",
  alternates: { canonical: '/careers' },
  robots: { index: false },
};

export default function CareersPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Company"
        title="Careers"
        description="We hire pragmatic generalists who like shipping. Remote-first; Visalia HQ for anyone close. Open roles: senior platform engineers, a product designer, and a customer success lead. Send a paragraph about something you shipped."
        contact="careers@sparx.works"
      />
      <Footer />
    </>
  );
}
