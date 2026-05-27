import { ModuleProvider } from '@sparx/ui';

export default function B2bLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="b2b">{children}</ModuleProvider>;
}
