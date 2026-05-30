'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  toast,
} from '@sparx/ui';
import { Copy, ExternalLink, Star, StarOff } from 'lucide-react';
import { addFavoriteAction, removeFavoriteAction } from '../_shell/actions';
import type { FavoritableItem } from '../_shell/registry';

// Wraps a sidebar item with a right-click context menu. Mirrors the menu
// shape from docs/24-dashboard-shell.md §5.4: entity-type label, then
// Add/Remove Favorites, then Copy link / Open in new tab. The menu is
// keyboard-accessible (ContextMenuTrigger gets the standard a11y wiring
// from Radix).

interface SidebarItemContextMenuProps {
  item: FavoritableItem;
  isFavorited: boolean;
  children: React.ReactNode;
}

export function SidebarItemContextMenu({
  item,
  isFavorited,
  children,
}: SidebarItemContextMenuProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  async function handleCopyLink() {
    try {
      const url = new URL(item.href, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  function handleOpenInNewTab() {
    window.open(item.href, '_blank', 'noopener');
  }

  function handleToggleFavorite() {
    const willBeFavorited = !isFavorited;
    startTransition(async () => {
      try {
        if (willBeFavorited) {
          await addFavoriteAction(item.id);
        } else {
          await removeFavoriteAction(item.id);
        }
      } catch {
        toast.error(willBeFavorited ? 'Could not add favorite' : 'Could not remove favorite');
      }
    });
  }

  // Used inside Module menus where the item itself is the module's root
  // navigation, not a sub-item — pre-router push when clicked from a menu
  // item (the ContextMenuItem doesn't accept asChild for Link reliably).
  void router;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>{kindLabel(item.kind)}</ContextMenuLabel>
        {isFavorited ? (
          <ContextMenuItem onSelect={handleToggleFavorite}>
            <StarOff className="h-4 w-4" />
            Remove from favorites
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={handleToggleFavorite}>
            <Star className="h-4 w-4" />
            Add to favorites
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleCopyLink}>
          <Copy className="h-4 w-4" />
          Copy link
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleOpenInNewTab}>
          <ExternalLink className="h-4 w-4" />
          Open in new tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function kindLabel(kind: FavoritableItem['kind']): string {
  return kind === 'action' ? 'Action' : 'Section';
}
