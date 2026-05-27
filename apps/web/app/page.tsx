import { Nav } from '@/components/marketing/nav';
import { Hero } from '@/components/marketing/hero';
import { LogoStrip } from '@/components/marketing/logo-strip';
import { StackReplacement } from '@/components/marketing/stack-replacement';
import { ModulesGrid } from '@/components/marketing/modules-grid';
import { DashboardShowcase } from '@/components/marketing/dashboard-showcase';
import { McpSpotlight } from '@/components/marketing/mcp-spotlight';
import { B2bSpotlight } from '@/components/marketing/b2b-spotlight';
import { Promise as PromiseSection } from '@/components/marketing/promise';
import { Testimonial } from '@/components/marketing/testimonial';
import { DeveloperSection } from '@/components/marketing/developer-section';
import { CompareTable } from '@/components/marketing/compare-table';
import { Pricing } from '@/components/marketing/pricing';
import { Faq } from '@/components/marketing/faq';
import { FinalCta } from '@/components/marketing/final-cta';
import { Footer } from '@/components/marketing/footer';

export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <LogoStrip />
      <StackReplacement />
      <ModulesGrid />
      <DashboardShowcase />
      <McpSpotlight />
      <B2bSpotlight />
      <PromiseSection />
      <Testimonial />
      <DeveloperSection />
      <CompareTable />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
