'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@sparx/ui';
import { CREATE_SENTINEL, hasCreateView } from '../_shell/detail-registry';
import type { DefaultDetailView, UserPreferences } from '../_shell/preferences-types';
import { usePreferences } from './preferences-provider';

// The create analog of `EntityRowLink`. Replaces the bare
// `<Button asChild><Link href=".../new">` so the "New X" affordance opens in
// the SAME surface the user chose for viewing a record — drawer, modal, full
// page, or new tab — instead of always hard-navigating to the `/new` route.
//
//   Plain click     → user.preferences.defaultDetailView
//   Cmd/Ctrl-click   → new tab (browser default — we don't intercept)
//   Middle-click     → new tab (browser default — we don't intercept)
//   Alt-click        → force drawer (matches EntityRowLink)
//   Shift-click      → force full page (escape hatch)
//
// Drawer / modal set the overlay token `?drawer=type:new` (the `@detail` slot
// renders the registered create form for the sentinel id). When the type has
// no detail view registered we fall back to full-page navigation, since the
// overlay would have nothing to render.

type ButtonProps = React.ComponentProps<typeof Button>;

interface EntityCreateButtonProps extends Omit<ButtonProps, 'asChild' | 'onClick'> {
  /** Manifest entity-type id, e.g. 'collection', 'product', 'customer'. */
  entityType: string;
  /** The full-page create route. Used for full-page / new-tab modes. */
  newHref: string;
  children: React.ReactNode;
}

export function EntityCreateButton({
  entityType,
  newHref,
  children,
  ...buttonProps
}: EntityCreateButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preferences = usePreferences();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0) return; // only intercept plain left-click
    if (e.metaKey || e.ctrlKey) return; // let browser open in new tab
    if (e.shiftKey) return; // explicit full page

    const mode = resolveMode({ preferences, altKey: e.altKey, entityType });
    if (mode === 'fullPage') return; // let <Link> navigate as usual

    if (mode === 'newTab') {
      e.preventDefault();
      window.open(newHref, '_blank', 'noopener');
      return;
    }

    // Drawer or modal — open the create overlay in place. No nav.
    e.preventDefault();
    const next = new URLSearchParams(searchParams ?? '');
    next.delete('drawer');
    next.delete('modal');
    next.set(mode, `${entityType}:${CREATE_SENTINEL}`);
    router.replace(`${pathname ?? '/'}?${next.toString()}`);
  }

  return (
    <Button asChild {...buttonProps}>
      <Link href={newHref} onClick={handleClick}>
        {children}
      </Link>
    </Button>
  );
}

function resolveMode({
  preferences,
  altKey,
  entityType,
}: {
  preferences: UserPreferences;
  altKey: boolean;
  entityType: string;
}): DefaultDetailView {
  if (altKey && hasCreateView(entityType)) return 'drawer';
  const pref = preferences.defaultDetailView;
  // If the entity type has no create overlay registered, the drawer/modal would
  // have nothing to render — fall back to the full-page /new route.
  if ((pref === 'drawer' || pref === 'modal') && !hasCreateView(entityType)) {
    return 'fullPage';
  }
  return pref;
}
