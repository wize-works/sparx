import { ModuleProvider } from '@sparx/ui';

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="email">{children}</ModuleProvider>;
}
