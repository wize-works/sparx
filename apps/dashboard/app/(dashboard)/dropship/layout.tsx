import { ModuleProvider } from '@sparx/ui';

export default function DropshipLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="dropship">{children}</ModuleProvider>;
}
