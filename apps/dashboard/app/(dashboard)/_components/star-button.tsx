'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@sparx/ui';
import { Star } from 'lucide-react';
import { addFavoriteAction, removeFavoriteAction } from '../_shell/actions';
import { findFavoritableByPath } from '../_shell/registry';
import type { FavoriteRow } from '../_shell/service';

// Header star toggle. Visible only when the current pathname exactly
// matches a manifest action or section href — entity-instance routes
// (e.g. /commerce/products/abc-123) are deliberately non-favoritable.
//
// Optimistic update: the icon flips immediately, the server action runs in
// the background. revalidatePath inside the action then refreshes the
// sidebar Favorites section on success.

interface StarButtonProps {
  favorites: FavoriteRow[];
}

export function StarButton({ favorites }: StarButtonProps) {
  const pathname = usePathname();
  const item = pathname ? findFavoritableByPath(pathname) : undefined;
  const serverFavorited = item ? favorites.some((f) => f.actionId === item.id) : false;
  const [optimisticFavorited, setOptimisticFavorited] = React.useState<boolean | null>(null);
  const [, startTransition] = React.useTransition();

  // Reset optimistic state when the server data catches up.
  React.useEffect(() => {
    setOptimisticFavorited(null);
  }, [serverFavorited, item?.id]);

  if (!item) {
    // No favoritable item for this route — render nothing rather than a
    // disabled stub. The header stays balanced because flex doesn't reserve
    // space for absent children.
    return null;
  }

  const isFavorited = optimisticFavorited ?? serverFavorited;
  const nextLabel = isFavorited ? 'Remove from favorites' : 'Add to favorites';

  function handleClick() {
    if (!item) return;
    const willBeFavorited = !isFavorited;
    setOptimisticFavorited(willBeFavorited);
    startTransition(async () => {
      try {
        if (willBeFavorited) {
          await addFavoriteAction(item.id);
        } else {
          await removeFavoriteAction(item.id);
        }
      } catch {
        // Roll back the optimistic flip on error.
        setOptimisticFavorited(!willBeFavorited);
      }
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={nextLabel} onClick={handleClick}>
          <Star
            className={`h-4 w-4 ${isFavorited ? 'fill-current text-[var(--module-active,var(--color-text-primary))]' : ''}`}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{nextLabel}</TooltipContent>
    </Tooltip>
  );
}
