'use client';

import * as React from 'react';
import Link from 'next/link';
import { ModuleProvider, useRailExpanded } from '@sparx/ui';
import { Home, Search, Settings } from 'lucide-react';
import { moduleManifests } from '../_shell/registry';

// The icon rail — the first column of the shell nav (docs/24 §5). Module
// switching + Home + Search + Settings. The active module's tile adopts its
// color via the wrapping ModuleProvider. Account control lives in the top
// toolbar, not here.
//
// The shell can expand the rail (persisted toggle at its foot); when expanded
// each tile grows a text label so the module glyphs are legible. `useRailExpanded`
// reads that state from the shell's context.

const TILE_BASE =
  'relative flex h-10 items-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none';
const TILE_INACTIVE =
  'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]';
const TILE_ACTIVE = 'bg-[var(--module-active)] text-white';

function tileClass(active: boolean, expanded: boolean) {
  const shape = expanded ? 'w-full justify-start gap-3 px-3' : 'w-10 justify-center';
  return `${TILE_BASE} ${shape} ${active ? TILE_ACTIVE : TILE_INACTIVE}`;
}

function openCommandPalette() {
  window.dispatchEvent(new Event('sparx:open-command-palette'));
}

interface RailNavProps {
  pathname: string | null;
  enabledModules: readonly string[];
}

export function RailNav({ pathname, enabledModules }: RailNavProps) {
  const visible = moduleManifests.filter((m) => enabledModules.includes(m.id));
  const expanded = useRailExpanded();

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

      <div
        aria-hidden
        className={`my-1 h-px bg-[var(--color-border-default)] ${expanded ? 'w-full' : 'w-7'}`}
      />

      {visible.map((manifest) => {
        const Icon = manifest.icon;
        const active =
          pathname === manifest.routePrefix ||
          (pathname?.startsWith(`${manifest.routePrefix}/`) ?? false);
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

      <div className="flex-1" />

      <Link
        href="/settings"
        title="Settings"
        aria-label="Settings"
        className={tileClass(
          pathname === '/settings' || (pathname?.startsWith('/settings/') ?? false),
          expanded
        )}
      >
        <Settings className="h-5 w-5 shrink-0" />
        {expanded && <span className="truncate text-sm font-medium">Settings</span>}
      </Link>
    </>
  );
}
