'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarItem, SidebarSection, SidebarSectionLabel, Stack, Text } from '@sparx/ui';
import { Clock } from 'lucide-react';
import { recordVisitAction } from '../_shell/actions';
import { findFavoritableByPath, findFavoritableById } from '../_shell/registry';
import type { FavoriteRow, RecentRow } from '../_shell/service';
import { SidebarItemContextMenu } from './sidebar-item-context-menu';

// Sidebar Recents — initial list arrives server-rendered. The component
// then keeps a client-side optimistic copy: on each pathname change, if
// the new path resolves to a favoritable manifest item, the item is
// promoted to the top of the local list and `recordVisitAction` is fired
// (server-side it upserts the row). Server reconciliation happens on next
// full page load.

const VISIBLE_LIMIT = 10;

interface RecentsSectionProps {
  recents: RecentRow[];
  favorites: FavoriteRow[];
}

export function RecentsSection({ recents, favorites }: RecentsSectionProps) {
  const pathname = usePathname();
  const [localRecents, setLocalRecents] = React.useState<RecentRow[]>(recents);

  // Sync local state when the server-passed list changes (e.g. revalidation
  // after a favorites mutation).
  React.useEffect(() => {
    setLocalRecents(recents);
  }, [recents]);

  // On pathname change, optimistically prepend + dedup + fire server upsert.
  React.useEffect(() => {
    if (!pathname) return;
    const item = findFavoritableByPath(pathname);
    if (!item) return;

    setLocalRecents((prev) => {
      const filtered = prev.filter((r) => r.actionId !== item.id);
      return [{ actionId: item.id, lastVisitedAt: new Date().toISOString() }, ...filtered];
    });

    // Fire and forget. Failures are non-fatal — the local state still
    // reflects the visit; next reload may temporarily miss the row but the
    // user will revisit and re-upsert.
    void recordVisitAction(item.id);
  }, [pathname]);

  const resolved = localRecents
    .map((r) => ({ row: r, item: findFavoritableById(r.actionId) }))
    .filter((x): x is { row: RecentRow; item: NonNullable<typeof x.item> } => Boolean(x.item))
    .slice(0, VISIBLE_LIMIT);

  if (resolved.length === 0) {
    return (
      <SidebarSection>
        <SidebarSectionLabel>Recents</SidebarSectionLabel>
        <EmptyHint />
      </SidebarSection>
    );
  }

  return (
    <SidebarSection>
      <SidebarSectionLabel>Recents</SidebarSectionLabel>
      {resolved.map(({ item }) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
        const isFavorited = favorites.some((f) => f.actionId === item.id);
        return (
          <SidebarItemContextMenu key={item.id} item={item} isFavorited={isFavorited}>
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
      <Clock className="h-3.5 w-3.5" />
      <Text size="xs" variant="muted">
        Pages you visit appear here
      </Text>
    </Stack>
  );
}
