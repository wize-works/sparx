'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ModuleProvider,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarSectionLabel,
  Stack,
  Text,
  Wordmark,
} from '@sparx/ui';
import { Home, Search, Settings } from 'lucide-react';
import { getManifestForPath, moduleManifests } from '../_shell/registry';
import type { FavoriteRow, RecentRow } from '../_shell/service';
import { FavoritesSection } from './favorites-section';
import { ModuleSectionItems } from './module-section-nav';
import { RecentsSection } from './recents-section';

// Mobile nav — the rail + contextual panel translated to a single vertical
// drawer (below md). One coherent model: switch modules, see the current
// module's sections, and reach Favorites/Recents — the same affordances the
// desktop rail + panel expose. See docs/24 §5.

function openCommandPalette() {
  window.dispatchEvent(new Event('sparx:open-command-palette'));
}

interface MobileNavProps {
  pathname: string | null;
  enabledModules: readonly string[];
  favorites: FavoriteRow[];
  recents: RecentRow[];
}

export function MobileNav({ pathname, enabledModules, favorites, recents }: MobileNavProps) {
  const visible = moduleManifests.filter((m) => enabledModules.includes(m.id));
  const manifest = pathname ? getManifestForPath(pathname) : undefined;
  const activeModule = manifest && enabledModules.includes(manifest.id) ? manifest : undefined;

  return (
    <>
      <SidebarHeader>
        <Stack gap={0}>
          <Wordmark size={18} />
          <Text size="xs" variant="muted">
            Dashboard
          </Text>
        </Stack>
      </SidebarHeader>

      <SidebarNav>
        <SidebarSection>
          <SidebarItem icon={<Search className="h-4 w-4" />} onClick={openCommandPalette}>
            Search
          </SidebarItem>
          <SidebarItem asChild active={pathname === '/'} icon={<Home className="h-4 w-4" />}>
            <Link href="/">Home</Link>
          </SidebarItem>
        </SidebarSection>

        {activeModule && (
          <ModuleProvider module={activeModule.id}>
            <SidebarSection>
              <SidebarSectionLabel>{activeModule.label}</SidebarSectionLabel>
              <ModuleSectionItems manifest={activeModule} pathname={pathname} />
            </SidebarSection>
          </ModuleProvider>
        )}

        <SidebarSection>
          <SidebarSectionLabel>Modules</SidebarSectionLabel>
          {visible.map((m) => {
            const Icon = m.icon;
            const active =
              pathname === m.routePrefix || (pathname?.startsWith(`${m.routePrefix}/`) ?? false);
            return (
              <ModuleProvider key={m.id} module={m.id}>
                <SidebarItem asChild active={active} icon={<Icon className="h-4 w-4" />}>
                  <Link href={m.routePrefix}>{m.label}</Link>
                </SidebarItem>
              </ModuleProvider>
            );
          })}
        </SidebarSection>

        <FavoritesSection favorites={favorites} />
        <RecentsSection recents={recents} favorites={favorites} />

        <SidebarSection>
          <SidebarItem
            asChild
            active={pathname === '/settings' || (pathname?.startsWith('/settings/') ?? false)}
            icon={<Settings className="h-4 w-4" />}
          >
            <Link href="/settings">Settings</Link>
          </SidebarItem>
        </SidebarSection>
      </SidebarNav>
    </>
  );
}
