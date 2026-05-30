import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { PostHogProvider } from '../components/posthog-provider';
import './globals.css';
import './marketing.css';

const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'WizeWorks, Inc.',
  url: 'https://wize.works',
  logo: 'https://sparx.works/icon.png',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Visalia',
    addressRegion: 'CA',
    addressCountry: 'US',
  },
  brand: {
    '@type': 'Brand',
    name: 'Sparx',
    url: 'https://sparx.works',
  },
  sameAs: ['https://wize.works', 'https://sparx.works'],
};

const PRODUCT_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Sparx',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'A modular commerce operating system. Storefront, CRM, CMS, email, B2B, and AI — one platform, one bill, one data layer.',
  offers: {
    '@type': 'Offer',
    price: '49',
    priceCurrency: 'USD',
  },
  url: 'https://sparx.works',
  publisher: {
    '@type': 'Organization',
    name: 'WizeWorks, Inc.',
    url: 'https://wize.works',
  },
};

export const metadata: Metadata = {
  title: 'Sparx — Commerce, ignited.',
  description:
    'A modular commerce operating system. Storefront, CRM, CMS, email, B2B, and AI — one platform, one bill, one data layer. Pay only for what you use. Live in five minutes.',
  metadataBase: new URL('https://sparx.works'),
  alternates: {
    canonical: '/',
  },
  // OG + Twitter images are generated dynamically from app/opengraph-image.tsx
  // and app/twitter-image.tsx — Next auto-discovers them.
  openGraph: {
    title: 'Sparx — Commerce, ignited.',
    description:
      'Modular commerce OS by WizeWorks. Eight pieces, one platform, MCP-native AI. Live in five minutes.',
    url: 'https://sparx.works',
    siteName: 'Sparx',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sparx — Commerce, ignited.',
    description: 'Modular commerce OS by WizeWorks.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  applicationName: 'Sparx',
  authors: [{ name: 'WizeWorks, Inc.', url: 'https://wize.works' }],
  creator: 'WizeWorks, Inc.',
  publisher: 'WizeWorks, Inc.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <PostHogProvider>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_SCHEMA) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_SCHEMA) }}
          />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
