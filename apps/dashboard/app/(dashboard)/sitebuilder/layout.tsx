import { ModuleProvider } from '@sparx/ui';

// Padding for every Site Builder page lives here so each page.tsx can stay a
// bare flex column. Deliberately full-width (no `Container` max-width) so the
// customizer / preview split uses the entire content region — but with real
// horizontal gutters so content never runs into the shell chrome on either side.
export default function SitebuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleProvider module="storefront">
      <div className="px-6 py-10 lg:px-10">{children}</div>
    </ModuleProvider>
  );
}
