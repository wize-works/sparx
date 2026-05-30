'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { hasDetailComponent } from '../_shell/detail-registry';
import type { DefaultDetailView, UserPreferences } from '../_shell/preferences';
import { usePreferences } from './preferences-provider';

// Replaces `<Link>` for any row in an entity list (orders, customers,
// pages, etc.) that should respect the user's default detail view
// preference. Click behavior:
//
//   Plain click          → user.preferences.defaultDetailView
//   Cmd/Ctrl-click       → new tab (browser default — we don't intercept)
//   Middle-click         → new tab (browser default — we don't intercept)
//   Alt-click            → forces drawer mode (Notion-style power shortcut)
//   Shift-click          → forces full page (escape hatch)
//
// If the entity type isn't registered in the detail-registry (no
// _content.tsx) we always fall back to full page regardless of preference.

interface EntityRowLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  /** The full-page route for this entity. Used as href for new-tab / full-page. */
  href: string;
  /** Manifest entity-type id, e.g. 'page', 'order', 'customer'. */
  entityType: string;
  /** Entity instance id used in `?drawer=type:id`. */
  entityId: string;
  children: React.ReactNode;
}

export function EntityRowLink({
  href,
  entityType,
  entityId,
  children,
  onClick,
  ...rest
}: EntityRowLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preferences = usePreferences();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0) return; // only intercept plain left-click
    if (e.metaKey || e.ctrlKey) return; // let browser open in new tab
    if (e.shiftKey) return; // explicit full page

    const mode = resolveMode({ preferences, altKey: e.altKey, entityType });
    if (mode === 'fullPage') return; // let <Link> navigate as usual

    if (mode === 'newTab') {
      e.preventDefault();
      window.open(href, '_blank', 'noopener');
      return;
    }

    // Drawer or modal — update the URL query in place. No nav.
    e.preventDefault();
    const next = new URLSearchParams(searchParams ?? '');
    next.delete('drawer');
    next.delete('modal');
    next.set(mode, `${entityType}:${entityId}`);
    router.replace(`${pathname ?? '/'}?${next.toString()}`);
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
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
  if (altKey) return 'drawer';
  const pref = preferences.defaultDetailView;
  // If the entity type isn't registered for detail views, fall back to
  // full-page navigation — drawer / modal would have nothing to render.
  if ((pref === 'drawer' || pref === 'modal') && !hasDetailComponent(entityType)) {
    return 'fullPage';
  }
  return pref;
}
