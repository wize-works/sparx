import { ModuleProvider } from '@sparx/ui';

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return <ModuleProvider module="ai">{children}</ModuleProvider>;
}
