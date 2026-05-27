import { ModuleProvider } from '@sparx/ui';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="crm">{children}</ModuleProvider>;
}
