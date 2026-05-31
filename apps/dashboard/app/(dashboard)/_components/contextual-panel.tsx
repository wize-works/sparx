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
// Its top follows context: inside a module it lists that module's sections;
// at platform level it leads with Home. Favorites + Recents are ALWAYS present
// (cross-module shortcuts you need everywhere): standalone at platform level,
// and pinned in a footer below the scrolling sections inside a module. The
// footer sits outside the ModuleProvider so the shortcuts stay brand-neutral
// while the module color marks where you are.

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
      <div className="flex h-full flex-col">
        <ModuleProvider module={activeModule.id} className="flex min-h-0 flex-1 flex-col">
          <PanelHead eyebrow="Module" title={activeModule.label} dot />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNav label="Sections" className="gap-0.5 px-2 pb-3">
              <ModuleSectionItems manifest={activeModule} pathname={pathname} />
            </SidebarNav>
          </div>
        </ModuleProvider>
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-[var(--color-border-default)]">
          <SidebarNav label="Shortcuts" className="px-2 py-3">
            <FavoritesSection favorites={favorites} />
            <RecentsSection recents={recents} favorites={favorites} />
          </SidebarNav>
        </div>
      </div>
    );
  }

  // Platform level — Home, then the same cross-module shortcuts.
  return (
    <div className="flex h-full flex-col">
      <PanelHead eyebrow="Workspace" title={tenantName} />
      <SidebarNav label="Shortcuts" className="overflow-y-auto px-2 pb-3">
        <SidebarItem asChild active={pathname === '/'} icon={<Home className="h-4 w-4" />}>
          <Link href="/">Home</Link>
        </SidebarItem>
        <FavoritesSection favorites={favorites} />
        <RecentsSection recents={recents} favorites={favorites} />
      </SidebarNav>
    </div>
  );
}
