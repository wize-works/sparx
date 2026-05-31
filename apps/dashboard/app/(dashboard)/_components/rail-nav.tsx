'use client';

import * as React from 'react';
import Link from 'next/link';
import { ModuleProvider, useRailExpanded } from '@sparx/ui';
import { Clock, Home, Search, Settings, Star } from 'lucide-react';
import {
  moduleManifests,
  findFavoritableById,
  findFavoritableByPath,
  type FavoritableItem,
} from '../_shell/registry';
import type { FavoriteRow, RecentRow } from '../_shell/service';
import { recordVisitAction } from '../_shell/actions';

// The icon rail — the primary sidebar (docs/24 §5). Module switching plus the
// cross-module shortcuts that need to be reachable from anywhere: Home, Search,
// Favorites, Recents, Settings. The active module's tile adopts its color via
// ModuleProvider. The contextual panel beside it stays purely about the current
// module's sections.
//
// Collapsed, the rail is icon-only (favorites/recents show as their item icons
// with hover labels); expanded (persisted toggle, owned by the shell) every
// tile grows a text label and the Favorites/Recents groups gain headings.
// Account control lives in the top toolbar, not here.

const RECENTS_LIMIT = 8;

const TILE_BASE =
  'relative flex h-10 items-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none';
const TILE_INACTIVE =
  'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]';
const TILE_ACTIVE = 'bg-[var(--module-active)] text-white';

function tileClass(active: boolean, expanded: boolean) {
  const shape = expanded ? 'w-full justify-start gap-3 px-3' : 'w-10 justify-center';
  return `${TILE_BASE} ${shape} ${active ? TILE_ACTIVE : TILE_INACTIVE}`;
}

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

function openCommandPalette() {
  window.dispatchEvent(new Event('sparx:open-command-palette'));
}

interface RailNavProps {
  pathname: string | null;
  enabledModules: readonly string[];
  favorites: FavoriteRow[];
  recents: RecentRow[];
}

export function RailNav({ pathname, enabledModules, favorites, recents }: RailNavProps) {
  const visible = moduleManifests.filter((m) => enabledModules.includes(m.id));
  const expanded = useRailExpanded();

  // Optimistic recents (mirrors the former panel section): on navigation,
  // promote the current path to the top of the local list and fire the server
  // upsert. Server reconciliation happens on the next full load.
  const [localRecents, setLocalRecents] = React.useState<RecentRow[]>(recents);
  React.useEffect(() => setLocalRecents(recents), [recents]);
  React.useEffect(() => {
    if (!pathname) return;
    const item = findFavoritableByPath(pathname);
    if (!item) return;
    setLocalRecents((prev) => [
      { actionId: item.id, lastVisitedAt: new Date().toISOString() },
      ...prev.filter((r) => r.actionId !== item.id),
    ]);
    void recordVisitAction(item.id);
  }, [pathname]);

  const favItems = favorites.flatMap((f) => {
    const item = findFavoritableById(f.actionId);
    return item ? [item] : [];
  });
  const recentItems = localRecents
    .flatMap((r) => {
      const item = findFavoritableById(r.actionId);
      return item ? [item] : [];
    })
    .slice(0, RECENTS_LIMIT);

  return (
    <>
      <div
        className={`flex items-center ${expanded ? 'w-full gap-3 px-1 py-1' : 'justify-center'}`}
      >
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--module-active)] text-sm font-bold text-white"
        >
          S
        </div>
        {expanded && (
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Sparx</span>
        )}
      </div>

      <button
        type="button"
        onClick={openCommandPalette}
        title="Search  ⌘K"
        aria-label="Search"
        className={tileClass(false, expanded)}
      >
        <Search className="h-5 w-5 shrink-0" />
        {expanded && <span className="truncate text-sm font-medium">Search</span>}
      </button>

      <Link
        href="/"
        title="Home"
        aria-label="Home"
        className={tileClass(pathname === '/', expanded)}
      >
        <Home className="h-5 w-5 shrink-0" />
        {expanded && <span className="truncate text-sm font-medium">Home</span>}
      </Link>

      <RailDivider expanded={expanded} />

      {/* Scrollable middle — modules + shortcuts. Brand/Search/Home stay pinned
          above, Settings + the expand toggle stay pinned below. */}
      <div
        className={`flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto ${
          expanded ? 'items-stretch' : 'items-center'
        }`}
      >
        {visible.map((manifest) => {
          const Icon = manifest.icon;
          const active = isActivePath(pathname, manifest.routePrefix);
          return (
            <ModuleProvider key={manifest.id} module={manifest.id}>
              <Link
                href={manifest.routePrefix}
                title={manifest.label}
                aria-label={manifest.label}
                aria-current={active ? 'page' : undefined}
                className={tileClass(active, expanded)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {expanded && <span className="truncate text-sm font-medium">{manifest.label}</span>}
              </Link>
            </ModuleProvider>
          );
        })}

        <RailGroup
          label="Favorites"
          groupIcon={Star}
          items={favItems}
          pathname={pathname}
          expanded={expanded}
        />
        <RailGroup
          label="Recents"
          groupIcon={Clock}
          items={recentItems}
          pathname={pathname}
          expanded={expanded}
        />
      </div>

      <RailDivider expanded={expanded} />

      <Link
        href="/settings"
        title="Settings"
        aria-label="Settings"
        className={tileClass(isActivePath(pathname, '/settings'), expanded)}
      >
        <Settings className="h-5 w-5 shrink-0" />
        {expanded && <span className="truncate text-sm font-medium">Settings</span>}
      </Link>
    </>
  );
}

function RailDivider({ expanded }: { expanded: boolean }) {
  return (
    <div
      aria-hidden
      className={`my-1 h-px shrink-0 bg-[var(--color-border-default)] ${expanded ? 'w-full' : 'w-7'}`}
    />
  );
}

interface RailGroupProps {
  label: string;
  groupIcon: React.ComponentType<{ className?: string }>;
  items: FavoritableItem[];
  pathname: string | null;
  expanded: boolean;
}

// Renders a shortcut group (Favorites / Recents). Empty groups are omitted to
// keep the narrow rail uncluttered. Expanded shows a text heading; collapsed
// shows the group glyph as a quiet section marker.
function RailGroup({ label, groupIcon: GroupIcon, items, pathname, expanded }: RailGroupProps) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex w-full flex-col gap-1">
      {expanded ? (
        <div className="px-3 pt-2 pb-0.5 text-xs font-medium tracking-wider text-[var(--color-text-tertiary)] uppercase">
          {label}
        </div>
      ) : (
        <div className="my-0.5 flex justify-center" title={label}>
          <GroupIcon className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
        </div>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={tileClass(active, expanded)}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {expanded && <span className="truncate text-sm font-medium">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
