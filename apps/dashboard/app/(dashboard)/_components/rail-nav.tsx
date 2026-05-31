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

// The rail tiles mirror the module sidebar's `SidebarItem` (packages/ui
// navigation/sidebar.tsx) so the primary and contextual navs read at the same
// scale: h-8 rows, rounded-md, gap-2, text-sm, and the same tint active state.
// `group` lets the icon adopt SidebarItem's two-tone hover coloring.
const TILE_BASE =
  'group relative flex h-8 items-center rounded-md text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none';
const TILE_INACTIVE =
  'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]';
const TILE_ACTIVE = 'bg-[var(--module-active-tint)] text-[var(--module-active-text)]';

function tileClass(active: boolean, expanded: boolean) {
  const shape = expanded ? 'w-full justify-start gap-2 px-2' : 'w-8 justify-center';
  return `${TILE_BASE} ${shape} ${active ? TILE_ACTIVE : TILE_INACTIVE}`;
}

// Matches SidebarItem's icon wrapper: the glyph is tinted independently of the
// label — module color when active, a quiet tertiary→secondary on hover when not.
function tileIconClass(active: boolean) {
  return `inline-flex h-4 w-4 shrink-0 items-center justify-center ${
    active
      ? 'text-[var(--module-active)]'
      : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'
  }`;
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
        className={`flex items-center ${expanded ? 'w-full gap-2 px-2 py-1' : 'justify-center'}`}
      >
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--module-active)] text-sm font-bold text-white"
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
        <span className={tileIconClass(false)}>
          <Search className="h-4 w-4" />
        </span>
        {expanded && <span className="flex-1 truncate text-left">Search</span>}
      </button>

      <Link
        href="/"
        title="Home"
        aria-label="Home"
        className={tileClass(pathname === '/', expanded)}
      >
        <span className={tileIconClass(pathname === '/')}>
          <Home className="h-4 w-4" />
        </span>
        {expanded && <span className="flex-1 truncate text-left">Home</span>}
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
                <span className={tileIconClass(active)}>
                  <Icon className="h-4 w-4" />
                </span>
                {expanded && <span className="flex-1 truncate text-left">{manifest.label}</span>}
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
        <span className={tileIconClass(isActivePath(pathname, '/settings'))}>
          <Settings className="h-4 w-4" />
        </span>
        {expanded && <span className="flex-1 truncate text-left">Settings</span>}
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
            <span className={tileIconClass(active)}>
              <Icon className="h-4 w-4" />
            </span>
            {expanded && <span className="flex-1 truncate text-left">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
