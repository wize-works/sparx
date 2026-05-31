'use client';

import * as React from 'react';
import Link from 'next/link';
import { ModuleProvider } from '@sparx/ui';
import { Home, Search, Settings } from 'lucide-react';
import { moduleManifests } from '../_shell/registry';

// The icon rail — the first column of the shell nav (docs/24 §5). Module
// switching + Home + Search + Settings. The active module's tile adopts its
// color via the wrapping ModuleProvider. Account control lives in the top
// toolbar, not here.

const TILE_BASE =
  'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none';
const TILE_INACTIVE =
  'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]';
const TILE_ACTIVE = 'bg-[var(--module-active)] text-white';

function tileClass(active: boolean) {
  return `${TILE_BASE} ${active ? TILE_ACTIVE : TILE_INACTIVE}`;
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

  return (
    <>
      <div
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--module-active)] text-sm font-bold text-white"
      >
        S
      </div>

      <button
        type="button"
        onClick={openCommandPalette}
        title="Search  ⌘K"
        aria-label="Search"
        className={tileClass(false)}
      >
        <Search className="h-5 w-5" />
      </button>

      <Link href="/" title="Home" aria-label="Home" className={tileClass(pathname === '/')}>
        <Home className="h-5 w-5" />
      </Link>

      <div aria-hidden className="my-1 h-px w-7 bg-[var(--color-border-default)]" />

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
              className={tileClass(active)}
            >
              <Icon className="h-5 w-5" />
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
          pathname === '/settings' || (pathname?.startsWith('/settings/') ?? false)
        )}
      >
        <Settings className="h-5 w-5" />
      </Link>
    </>
  );
}
