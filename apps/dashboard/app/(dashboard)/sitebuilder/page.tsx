import { LayoutTemplate } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function SitebuilderPage() {
  return (
    <ModuleStub
      icon={<LayoutTemplate className="h-5 w-5" />}
      title="Sitebuilder"
      tagline="Themes, sections, and visual editing for your storefront."
      description="The Sitebuilder module gives you a visual editor over the storefront's theme — sections, blocks, navigation, and global tokens — without leaving the dashboard."
      features={[
        { title: 'Themes', description: 'Curated starting points with token-driven theming.' },
        { title: 'Sections', description: 'Drag-and-drop blocks per template (home, PDP, etc).' },
        { title: 'Navigation', description: 'Header, footer, and menu management.' },
        {
          title: 'Global tokens',
          description: 'Brand colors, type scale, spacing — applied site-wide.',
        },
        { title: 'Live preview', description: 'See changes mid-edit on real storefront data.' },
        { title: 'Publishing', description: 'Draft, schedule, and roll back with one click.' },
      ]}
    />
  );
}
