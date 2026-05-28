import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Changelog — Sparx',
  description: 'Every release, every breaking change, every deprecation. RSS feed ships with v1.0.',
  alternates: { canonical: '/changelog' },
  robots: { index: false },
};

export default function ChangelogPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Platform"
        title="Changelog"
        description="Every release, every breaking change, every deprecation — published the moment it ships. RSS feed and email digest go live with v1.0."
      />
      <Footer />
    </>
  );
}
