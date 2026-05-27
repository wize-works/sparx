import { ModuleProvider } from '@sparx/ui';

export default function SitebuilderLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="storefront">{children}</ModuleProvider>;
}
