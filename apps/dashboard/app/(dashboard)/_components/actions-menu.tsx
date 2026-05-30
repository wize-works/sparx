'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@sparx/ui';
import { Copy, ExternalLink, MoreHorizontal, Star, StarOff } from 'lucide-react';
import { addFavoriteAction, removeFavoriteAction } from '../_shell/actions';
import { findFavoritableByPath } from '../_shell/registry';
import type { FavoriteRow } from '../_shell/service';

// The `...` Actions menu — a searchable, grouped command list per
// docs/24-dashboard-shell.md §4.6.
//
// Phase 1 ships only universal actions (page-level, no entity context).
// Entity-specific items (Duplicate, Move to, Trash, Customize layout,
// Lock, Import/Export, Version history, Notify me) require a per-page
// EntityShell context that's not in scope here — they layer in once we
// have one.

interface ActionsMenuProps {
  favorites: FavoriteRow[];
}

export function ActionsMenu({ favorites }: ActionsMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const favoritableItem = pathname ? findFavoritableByPath(pathname) : undefined;
  const isFavorited = favoritableItem
    ? favorites.some((f) => f.actionId === favoritableItem.id)
    : false;

  function close() {
    setOpen(false);
  }

  async function handleCopyLink() {
    close();
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  function handleOpenInNewTab() {
    close();
    window.open(window.location.href, '_blank', 'noopener');
  }

  function handleToggleFavorite() {
    if (!favoritableItem) return;
    close();
    const willBeFavorited = !isFavorited;
    startTransition(async () => {
      try {
        if (willBeFavorited) {
          await addFavoriteAction(favoritableItem.id);
          toast.success('Added to favorites');
        } else {
          await removeFavoriteAction(favoritableItem.id);
          toast.success('Removed from favorites');
        }
      } catch {
        toast.error(willBeFavorited ? 'Could not add favorite' : 'Could not remove favorite');
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search actions…" />
          <CommandList>
            <CommandEmpty>No matching actions.</CommandEmpty>

            <CommandGroup heading="Page">
              <CommandItem value="copy link" onSelect={handleCopyLink}>
                <Copy className="h-4 w-4" />
                Copy link
                <CommandShortcut>Ctrl+L</CommandShortcut>
              </CommandItem>
              <CommandItem value="open in new tab" onSelect={handleOpenInNewTab}>
                <ExternalLink className="h-4 w-4" />
                Open in new tab
              </CommandItem>
              {favoritableItem &&
                (isFavorited ? (
                  <CommandItem value="remove favorite" onSelect={handleToggleFavorite}>
                    <StarOff className="h-4 w-4" />
                    Remove from favorites
                  </CommandItem>
                ) : (
                  <CommandItem value="add favorite" onSelect={handleToggleFavorite}>
                    <Star className="h-4 w-4" />
                    Add to favorites
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
