'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  ModuleProvider,
  SidebarAppShell,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarSectionLabel,
  Stack,
  Text,
  toast,
  Wordmark,
} from '@sparx/ui';
import { ChevronsUpDown, Home, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { authClient } from '@sparx/auth/client';
import { moduleManifests } from '../_shell/registry';
import type { FavoriteRow, RecentRow } from '../_shell/service';
import type { UserPreferences } from '../_shell/preferences-types';
import { BreadcrumbTrail } from './breadcrumb-trail';
import { CommandPalette } from './command-palette';
import { DashboardHeader } from './dashboard-header';
import { InlineDetailContent, ModalDetailContent, useDetailTarget } from './detail-panel';
import { FavoritesSection } from './favorites-section';
import { PreferencesProvider } from './preferences-provider';
import { RecentsSection } from './recents-section';

export interface DashboardShellProps {
  user: { id: string; email: string; name?: string | null };
  tenantName: string;
  favorites: FavoriteRow[];
  recents: RecentRow[];
  preferences: UserPreferences;
  children: React.ReactNode;
  /** Server-rendered detail body from the `@detail` slot (null when closed). */
  detail?: React.ReactNode;
}

export function DashboardShell({
  user,
  tenantName,
  favorites,
  recents,
  preferences,
  children,
  detail,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailTarget = useDetailTarget();
  const trimmedName = user.name?.trim();
  const emailLocal = user.email.split('@')[0] ?? user.email;
  const displayName = trimmedName && trimmedName.length > 0 ? trimmedName : emailLocal;

  const closeDetail = React.useCallback(() => {
    const next = new URLSearchParams(searchParams ?? '');
    next.delete('drawer');
    next.delete('modal');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? '/'));
  }, [pathname, router, searchParams]);

  // The detail body itself is server-rendered (the `@detail` slot). The shell
  // only decides where to mount it and wraps it in client chrome. `detail` is
  // null whenever no target is open, so the mode guards below stay in sync
  // with the slot.
  const inlineDetail =
    detailTarget?.mode === 'drawer' && detail ? (
      <InlineDetailContent target={detailTarget}>{detail}</InlineDetailContent>
    ) : null;

  const sidebar = (
    <>
      <SidebarHeader>
        <Stack gap={0}>
          <Wordmark size={18} />
          <Text size="xs" variant="muted">
            Dashboard
          </Text>
        </Stack>
      </SidebarHeader>
      <NavSections pathname={pathname} favorites={favorites} recents={recents} />
      <SidebarFooter>
        <UserMenu user={user} displayName={displayName} />
      </SidebarFooter>
    </>
  );

  return (
    <PreferencesProvider value={preferences}>
      <SidebarAppShell
        pathname={pathname}
        sidebar={sidebar}
        headerStart={<BreadcrumbTrail tenantName={tenantName} />}
        headerActions={<DashboardHeader favorites={favorites} preferences={preferences} />}
        detail={inlineDetail}
        onDetailClose={closeDetail}
      >
        {children}
      </SidebarAppShell>
      {/* Modal overlay is rendered separately — it's not part of the
          shell's split layout. */}
      {detailTarget?.mode === 'modal' && detail && (
        <ModalDetailContent target={detailTarget} onClose={closeDetail}>
          {detail}
        </ModalDetailContent>
      )}
      {/* ⌘K palette — mounted once at the shell, listens globally for the
          shortcut. Receives favorites + recents so they appear at the top
          of the search results without an extra fetch. */}
      <CommandPalette favorites={favorites} recents={recents} />
    </PreferencesProvider>
  );
}

function NavSections({
  pathname,
  favorites,
  recents,
}: {
  pathname: string | null;
  favorites: FavoriteRow[];
  recents: RecentRow[];
}) {
  return (
    <SidebarNav>
      <SidebarSection>
        <SidebarItem asChild active={pathname === '/'} icon={<Home className="h-4 w-4" />}>
          <Link href="/">Home</Link>
        </SidebarItem>
      </SidebarSection>

      <FavoritesSection favorites={favorites} />
      <RecentsSection recents={recents} favorites={favorites} />

      <SidebarSection>
        <SidebarSectionLabel>Modules</SidebarSectionLabel>
        {moduleManifests.map((manifest) => {
          const Icon = manifest.icon;
          const isActive =
            pathname === manifest.routePrefix || pathname?.startsWith(`${manifest.routePrefix}/`);
          return (
            <ModuleProvider key={manifest.id} module={manifest.id}>
              <SidebarItem asChild active={isActive} icon={<Icon className="h-4 w-4" />}>
                <Link href={manifest.routePrefix}>{manifest.label}</Link>
              </SidebarItem>
            </ModuleProvider>
          );
        })}
      </SidebarSection>

      <SidebarSection>
        <SidebarItem
          asChild
          active={pathname === '/settings' || pathname?.startsWith('/settings/')}
          icon={<Settings className="h-4 w-4" />}
        >
          <Link href="/settings">Settings</Link>
        </SidebarItem>
      </SidebarSection>
    </SidebarNav>
  );
}

function UserMenu({
  user,
  displayName,
}: {
  user: DashboardShellProps['user'];
  displayName: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push('/sign-in');
      router.refresh();
    } catch {
      toast.error('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${displayName}`}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-bg-muted)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
      >
        <Avatar size="sm" alt={displayName} />
        <Stack gap={0} className="min-w-0 flex-1">
          <Text size="xs" weight="medium" className="truncate">
            {displayName}
          </Text>
          <Text size="xs" variant="muted" className="truncate">
            {user.email}
          </Text>
        </Stack>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuLabel>Signed in as {user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <UserIcon className="h-4 w-4" />
            Profile
            <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            Settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={signingOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
