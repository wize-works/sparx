'use client';

import * as React from 'react';
import Link from 'next/link';
import { ModuleProvider, SidebarItem, SidebarNav, Text } from '@sparx/ui';
import { Home } from 'lucide-react';
import { getManifestForPath } from '../_shell/registry';
import type { FavoriteRow, RecentRow } from '../_shell/service';
import { FavoritesSection } from './favorites-section';
import { ModuleSectionItems } from './module-section-nav';
import { RecentsSection } from './recents-section';

// The contextual panel — the second column of the shell nav (docs/24 §5).
// Its contents follow context, not a mode toggle:
//   • inside a module  → that module's sections (the intra-module nav)
//   • at platform level → Favorites + Recents (cross-module shortcuts)
// so Favorites/Recents stay first-class when no module is active.

interface ContextualPanelProps {
  pathname: string | null;
  enabledModules: readonly string[];
  favorites: FavoriteRow[];
  recents: RecentRow[];
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

export function ContextualPanel({
  pathname,
  enabledModules,
  favorites,
  recents,
  tenantName,
}: ContextualPanelProps) {
  const manifest = pathname ? getManifestForPath(pathname) : undefined;
  const activeModule = manifest && enabledModules.includes(manifest.id) ? manifest : undefined;

  if (activeModule) {
    return (
      <ModuleProvider module={activeModule.id} className="flex h-full flex-col">
        <PanelHead eyebrow="Module" title={activeModule.label} dot />
        <SidebarNav label="Sections" className="gap-0.5 px-2 pb-3">
          <ModuleSectionItems manifest={activeModule} pathname={pathname} />
        </SidebarNav>
      </ModuleProvider>
    );
  }

  // Platform level — surface the cross-module shortcuts.
  return (
    <div className="flex h-full flex-col">
      <PanelHead eyebrow="Workspace" title={tenantName} />
      <SidebarNav label="Shortcuts" className="px-2 pb-3">
        <SidebarItem asChild active={pathname === '/'} icon={<Home className="h-4 w-4" />}>
          <Link href="/">Home</Link>
        </SidebarItem>
        <FavoritesSection favorites={favorites} />
        <RecentsSection recents={recents} favorites={favorites} />
      </SidebarNav>
    </div>
  );
}
