'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
import {
  Check,
  Copy,
  ExternalLink,
  LayoutGrid,
  Layout,
  MoreHorizontal,
  PanelRight,
  Rows3,
  Square,
  Star,
  StarOff,
} from 'lucide-react';
import {
  addFavoriteAction,
  removeFavoriteAction,
  setDefaultDetailViewAction,
  setDefaultListViewAction,
} from '../_shell/actions';
import { findFavoritableByPath } from '../_shell/registry';
import type { FavoriteRow } from '../_shell/service';
import type {
  DefaultDetailView,
  DefaultListView,
  UserPreferences,
} from '../_shell/preferences-types';

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
  preferences: UserPreferences;
}

const DETAIL_VIEW_OPTIONS: { value: DefaultDetailView; label: string; icon: typeof PanelRight }[] =
  [
    { value: 'drawer', label: 'Drawer', icon: PanelRight },
    { value: 'modal', label: 'Modal', icon: Square },
    { value: 'fullPage', label: 'Full page', icon: Layout },
    { value: 'newTab', label: 'New tab', icon: ExternalLink },
  ];

const LIST_VIEW_OPTIONS: { value: DefaultListView; label: string; icon: typeof PanelRight }[] = [
  { value: 'table', label: 'Table', icon: Rows3 },
  { value: 'card', label: 'Cards', icon: LayoutGrid },
];

export function ActionsMenu({ favorites, preferences }: ActionsMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  function handleSetDefaultView(next: DefaultDetailView) {
    if (next === preferences.defaultDetailView) {
      close();
      return;
    }
    close();
    startTransition(async () => {
      try {
        await setDefaultDetailViewAction(next);
        // revalidatePath() in the action invalidates the server cache, but
        // PreferencesProvider in the client tree was hydrated once with the
        // old value — refresh the route so the new preference reaches
        // EntityRowLink's resolveMode immediately.
        router.refresh();
        const label =
          DETAIL_VIEW_OPTIONS.find((o) => o.value === next)?.label.toLowerCase() ?? next;
        toast.success(`Default detail view set to ${label}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update preference');
      }
    });
  }

  function handleSetListView(next: DefaultListView) {
    if (next === preferences.defaultListView) {
      close();
      return;
    }
    close();
    startTransition(async () => {
      try {
        await setDefaultListViewAction(next);
        // Same as the detail view: list pages read the preference server-side
        // to pick table vs card rendering, so refresh so it takes effect now.
        router.refresh();
        const label = LIST_VIEW_OPTIONS.find((o) => o.value === next)?.label.toLowerCase() ?? next;
        toast.success(`Default list view set to ${label}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update preference');
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

            <CommandGroup heading="Default detail view">
              {DETAIL_VIEW_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isCurrent = preferences.defaultDetailView === opt.value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={`default detail view ${opt.label}`}
                    onSelect={() => handleSetDefaultView(opt.value)}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                    {isCurrent && (
                      <CommandShortcut>
                        <Check className="h-4 w-4" />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Default list view">
              {LIST_VIEW_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isCurrent = preferences.defaultListView === opt.value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={`default list view ${opt.label}`}
                    onSelect={() => handleSetListView(opt.value)}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                    {isCurrent && (
                      <CommandShortcut>
                        <Check className="h-4 w-4" />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
