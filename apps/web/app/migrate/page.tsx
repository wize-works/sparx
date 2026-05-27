import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Migration tools — Sparx',
  description:
    'Native importers for Shopify, HubSpot, Mailchimp, and WordPress. The Gillett Diesel migration ran in 14 days end-to-end including custom checkout work.',
  alternates: { canonical: '/migrate' },
  robots: { index: false },
};

export default function MigratePage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Platform"
        title="Migration tools"
        description="Native importers for Shopify (products, customers, orders, themes), HubSpot (contacts, deals, lists), Mailchimp (audiences, automations), and WordPress (posts, media, redirects). Most SMB migrations finish in under a week."
        contact="migrate@sparx.works"
      />
      <Footer />
    </>
  );
}
