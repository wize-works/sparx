'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPalette as UICommandPalette,
  CommandShortcut,
} from '@sparx/ui';
import { findFavoritableById, listFavoritableItems } from '../_shell/registry';
import type { FavoriteRow, RecentRow } from '../_shell/service';

// ⌘K Quick Mode. Three groups, all manifest-driven:
//   1. Favorites — the user's pinned items (top of the list).
//   2. Recents — the user's last-visited items.
//   3. Everything — every manifest action + every manifest section, less
//      whatever already appeared in Favorites or Recents.
//
// Selecting an item navigates to its href and closes the palette.
//
// Deep Mode (entity FTS) lands in a later PR — until then this is purely
// nav/action search, no entity-instance results. See docs/24-dashboard-shell.md
// §6 for the layered design.

interface CommandPaletteProps {
  favorites: FavoriteRow[];
  recents: RecentRow[];
}

export function CommandPalette({ favorites, recents }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Let non-keyboard surfaces (the rail/mobile-nav Search affordance) open the
  // palette without re-implementing the ⌘K shortcut. They dispatch a window
  // event; the palette owns the open state.
  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('sparx:open-command-palette', handler);
    return () => window.removeEventListener('sparx:open-command-palette', handler);
  }, []);

  const all = listFavoritableItems();

  const favoritedItems = favorites
    .map((f) => findFavoritableById(f.actionId))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const recentItems = recents
    .map((r) => findFavoritableById(r.actionId))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .filter((item) => !favoritedItems.some((f) => f.id === item.id))
    .slice(0, 5);

  const everythingElse = all
    .filter((item) => !favoritedItems.some((f) => f.id === item.id))
    .filter((item) => !recentItems.some((r) => r.id === item.id));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <UICommandPalette open={open} onOpenChange={setOpen} placeholder="Search…">
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {favoritedItems.length > 0 && (
          <CommandGroup heading="Favorites">
            {favoritedItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.moduleId}`}
                onSelect={() => go(item.href)}
              >
                <ItemIcon icon={item.icon} />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {recentItems.length > 0 && (
          <CommandGroup heading="Recents">
            {recentItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.moduleId}`}
                onSelect={() => go(item.href)}
              >
                <ItemIcon icon={item.icon} />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Everything">
          {everythingElse.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.moduleId} ${item.kind}`}
              onSelect={() => go(item.href)}
            >
              <ItemIcon icon={item.icon} />
              {item.label}
              <CommandShortcut>{item.moduleId}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </UICommandPalette>
  );
}

function ItemIcon({ icon: Icon }: { icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }) {
  return <Icon className="h-4 w-4" />;
}
