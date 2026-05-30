'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarItem, SidebarSection, SidebarSectionLabel, Stack, Text } from '@sparx/ui';
import { Star } from 'lucide-react';
import { findFavoritableById, type FavoritableItem } from '../_shell/registry';
import type { FavoriteRow } from '../_shell/service';
import { SidebarItemContextMenu } from './sidebar-item-context-menu';

// Sidebar Favorites — server-driven (initial rows arrive via DashboardShell
// props), refreshed by `revalidatePath` after star toggles. The row is
// resolved against the manifest registry at render: rows whose action_id no
// longer matches any manifest (orphaned by a module removal) are skipped
// instead of throwing.

interface FavoritesSectionProps {
  favorites: FavoriteRow[];
}

export function FavoritesSection({ favorites }: FavoritesSectionProps) {
  const pathname = usePathname();
  const resolved = favorites
    .map((f) => ({ row: f, item: findFavoritableById(f.actionId) }))
    .filter((x): x is { row: FavoriteRow; item: FavoritableItem } => Boolean(x.item));

  if (resolved.length === 0) {
    return (
      <SidebarSection>
        <SidebarSectionLabel>Favorites</SidebarSectionLabel>
        <EmptyHint />
      </SidebarSection>
    );
  }

  return (
    <SidebarSection>
      <SidebarSectionLabel>Favorites</SidebarSectionLabel>
      {resolved.map(({ item }) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
        return (
          <SidebarItemContextMenu key={item.id} item={item} isFavorited>
            <SidebarItem asChild active={isActive} icon={<Icon className="h-4 w-4" />}>
              <Link href={item.href}>{item.label}</Link>
            </SidebarItem>
          </SidebarItemContextMenu>
        );
      })}
    </SidebarSection>
  );
}

function EmptyHint() {
  return (
    <Stack direction="row" gap={2} align="center">
      <Star className="h-3.5 w-3.5" />
      <Text size="xs" variant="muted">
        Star a page to pin it here
      </Text>
    </Stack>
  );
}
