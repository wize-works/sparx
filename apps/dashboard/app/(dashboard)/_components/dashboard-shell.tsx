'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  type SparxModule,
  Stack,
  Text,
  toast,
  Wordmark,
} from '@sparx/ui';
import {
  Building2,
  ChevronsUpDown,
  FileText,
  Home,
  LayoutTemplate,
  LogOut,
  Mail,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { authClient } from '@sparx/auth/client';

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface ModuleNavLink extends NavLink {
  module: SparxModule;
}

const PRIMARY_NAV: NavLink[] = [{ href: '/', label: 'Home', icon: <Home className="h-4 w-4" /> }];

const MODULE_NAV: ModuleNavLink[] = [
  {
    href: '/sitebuilder',
    label: 'Sitebuilder',
    module: 'storefront',
    icon: <LayoutTemplate className="h-4 w-4" />,
  },
  {
    href: '/commerce',
    label: 'Commerce',
    module: 'commerce',
    icon: <ShoppingCart className="h-4 w-4" />,
  },
  { href: '/cms', label: 'CMS', module: 'cms', icon: <FileText className="h-4 w-4" /> },
  { href: '/crm', label: 'CRM', module: 'crm', icon: <Users className="h-4 w-4" /> },
  { href: '/email', label: 'Email', module: 'email', icon: <Mail className="h-4 w-4" /> },
  { href: '/b2b', label: 'B2B', module: 'b2b', icon: <Building2 className="h-4 w-4" /> },
  { href: '/dropship', label: 'Dropship', module: 'dropship', icon: <Truck className="h-4 w-4" /> },
  { href: '/ai', label: 'AI', module: 'ai', icon: <Sparkles className="h-4 w-4" /> },
];

const SECONDARY_NAV: NavLink[] = [
  { href: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
];

export interface DashboardShellProps {
  user: { id: string; email: string; name?: string | null };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const trimmedName = user.name?.trim();
  const emailLocal = user.email.split('@')[0] ?? user.email;
  const displayName = trimmedName && trimmedName.length > 0 ? trimmedName : emailLocal;

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
      <NavSections pathname={pathname} />
      <SidebarFooter>
        <UserMenu user={user} displayName={displayName} />
      </SidebarFooter>
    </>
  );

  return (
    <SidebarAppShell pathname={pathname} sidebar={sidebar}>
      {children}
    </SidebarAppShell>
  );
}

function NavSections({ pathname }: { pathname: string | null }) {
  return (
    <SidebarNav>
      <SidebarSection>
        {PRIMARY_NAV.map((item) => (
          <SidebarItem key={item.href} asChild active={pathname === item.href} icon={item.icon}>
            <Link href={item.href}>{item.label}</Link>
          </SidebarItem>
        ))}
      </SidebarSection>

      <SidebarSection>
        <SidebarSectionLabel>Modules</SidebarSectionLabel>
        {MODULE_NAV.map((item) => (
          <ModuleProvider key={item.href} module={item.module}>
            <SidebarItem
              asChild
              active={pathname === item.href || pathname?.startsWith(`${item.href}/`)}
              icon={item.icon}
            >
              <Link href={item.href}>{item.label}</Link>
            </SidebarItem>
          </ModuleProvider>
        ))}
      </SidebarSection>

      <SidebarSection>
        {SECONDARY_NAV.map((item) => (
          <SidebarItem
            key={item.href}
            asChild
            active={pathname === item.href || pathname?.startsWith(`${item.href}/`)}
            icon={item.icon}
          >
            <Link href={item.href}>{item.label}</Link>
          </SidebarItem>
        ))}
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
