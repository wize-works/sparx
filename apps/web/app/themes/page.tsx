import type { Metadata } from 'next';
import { Nav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { ComingSoon } from '@/components/marketing/coming-soon';

export const metadata: Metadata = {
  title: 'Themes — Sparx',
  description:
    'Curated themes for every commerce vertical — apparel, food, wholesale, services, content. Every theme works on phone and desktop, headless if you want.',
  alternates: { canonical: '/themes' },
  robots: { index: false },
};

export default function ThemesPage() {
  return (
    <>
      <Nav />
      <ComingSoon
        eyebrow="Platform"
        title="Themes"
        description="Curated themes for every commerce vertical — apparel, food, wholesale, services, content. Each theme works on phone and desktop, supports the full Sparx module set, and stays headless-friendly. The first batch of free themes ships with v1.0."
      />
      <Footer />
    </>
  );
}
