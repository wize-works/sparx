'use client';

import * as React from 'react';
import Link from 'next/link';
import { ModuleProvider, SidebarItem, SidebarNav, Text } from '@sparx/ui';
import { Home } from 'lucide-react';
import { getManifestForPath, moduleManifests } from '../_shell/registry';
import { ModuleSectionItems } from './module-section-nav';

// The contextual panel — the second column of the shell nav (docs/24 §5). It is
// purely about the current context:
//   • inside a module  → that module's sections (the intra-module nav)
//   • at platform level → a labeled directory of the enabled modules
// Cross-module shortcuts (Favorites, Recents) live in the primary rail, not
// here, so the panel never competes with the rail for the same job.

interface ContextualPanelProps {
  pathname: string | null;
  enabledModules: readonly string[];
  tenantName: string;
}

function PanelHead({ eyebrow, title, dot }: { eyebrow: string; title: string; dot?: boolean }) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-2">
      <Text size="xs" variant="muted" className="font-medium tracking-wider uppercase">
        {eyebrow}
      </Text>
      <div className="mt-0.5 flex items-center gap-2">
        {dot && (
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--module-active)]" />
        )}
        <Text size="sm" weight="medium" className="truncate">
          {title}
        </Text>
      </div>
    </div>
  );
}

export function ContextualPanel({ pathname, enabledModules, tenantName }: ContextualPanelProps) {
  const manifest = pathname ? getManifestForPath(pathname) : undefined;
  const activeModule = manifest && enabledModules.includes(manifest.id) ? manifest : undefined;

  if (activeModule) {
    return (
      <ModuleProvider module={activeModule.id} className="flex h-full flex-col">
        <PanelHead eyebrow="Module" title={activeModule.label} dot />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav label="Sections" className="gap-0.5 px-2 pb-3">
            <ModuleSectionItems manifest={activeModule} pathname={pathname} />
          </SidebarNav>
        </div>
      </ModuleProvider>
    );
  }

  // Platform level — a labeled directory of the modules this tenant can open.
  const modules = moduleManifests.filter((m) => enabledModules.includes(m.id));
  return (
    <div className="flex h-full flex-col">
      <PanelHead eyebrow="Workspace" title={tenantName} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav label="Modules" className="px-2 pb-3">
          <SidebarItem asChild active={pathname === '/'} icon={<Home className="h-4 w-4" />}>
            <Link href="/">Home</Link>
          </SidebarItem>
          {modules.map((m) => {
            const Icon = m.icon;
            const active =
              pathname === m.routePrefix || (pathname?.startsWith(`${m.routePrefix}/`) ?? false);
            return (
              <SidebarItem key={m.id} asChild active={active} icon={<Icon className="h-4 w-4" />}>
                <Link href={m.routePrefix}>{m.label}</Link>
              </SidebarItem>
            );
          })}
        </SidebarNav>
      </div>
    </div>
  );
}
