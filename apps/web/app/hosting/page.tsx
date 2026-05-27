import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Managed hosting — Sparx',
  description:
    'WizeWorks operates your Sparx infrastructure: GKE, Postgres, Postal, Redis, monitoring, on-call. $750/mo, includes 24/7 incident response.',
  alternates: { canonical: '/hosting' },
  robots: { index: false },
};

export default function HostingPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Platform"
        title="Managed hosting"
        description="WizeWorks operates your Sparx infrastructure end-to-end: GKE, Postgres, Postal, Redis, monitoring, backups, 24/7 on-call. $750/mo flat, no per-resource surprise billing. Gillett Diesel is the reference customer."
        contact="hosting@sparx.works"
      />
      <Footer />
    </>
  );
}
