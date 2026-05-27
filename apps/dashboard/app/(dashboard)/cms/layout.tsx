import { ModuleProvider } from '@sparx/ui';

// Wrapping the entire CMS subtree in ModuleProvider shifts --module-active
// to teal for every component inside. Buttons with variant="module",
// Cards with variant="module", Badge with variant="module", the active Tab
// underline, etc., all switch colors with zero per-component config.
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="cms">{children}</ModuleProvider>;
}
