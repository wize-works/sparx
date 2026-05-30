import { ModuleProvider } from '@sparx/ui';

// Vertical padding for every Site Builder page lives here so each page.tsx can
// stay a bare flex column. Deliberately full-width (no `Container` max-width) so
// the customizer / preview split uses the entire content region — we only add
// `py-10` so content doesn't run into the header chrome above it.
export default function SitebuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleProvider module="storefront">
      <div className="py-10">{children}</div>
    </ModuleProvider>
  );
}
