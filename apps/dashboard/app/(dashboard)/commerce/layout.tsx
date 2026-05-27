import { ModuleProvider } from '@sparx/ui';

export default function CommerceLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="commerce">{children}</ModuleProvider>;
}
