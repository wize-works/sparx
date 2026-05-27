import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Security & SOC 2 — Sparx',
  description:
    'Sparx is in active SOC 2 Type II audit. Vulnerability disclosure, vendor security questionnaire, and incident response policy on request.',
  alternates: { canonical: '/security' },
  robots: { index: false },
};

export default function SecurityPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Trust"
        title="Security & SOC 2"
        description="Sparx is in active SOC 2 Type II audit. Multi-tenancy is enforced at the database level via PostgreSQL row-level security. Encryption at rest and in transit by default. Vulnerability disclosure, vendor security questionnaire, and incident response policy available on request."
        contact="security@sparx.works"
      />
      <Footer />
    </>
  );
}
