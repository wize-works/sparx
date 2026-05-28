'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarSection,
  SidebarSectionLabel,
  Stack,
  Text,
} from '@sparx/ui';
import {
  Building2,
  ChevronDown,
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

const PRIMARY_NAV: NavLink[] = [
  { href: '/', label: 'Home', icon: <Home className="h-4 w-4" /> },
];

const MODULE_NAV: NavLink[] = [
  { href: '/sitebuilder', label: 'Sitebuilder', icon: <LayoutTemplate className="h-4 w-4" /> },
  { href: '/commerce', label: 'Commerce', icon: <ShoppingCart className="h-4 w-4" /> },
  { href: '/cms', label: 'CMS', icon: <FileText className="h-4 w-4" /> },
  { href: '/crm', label: 'CRM', icon: <Users className="h-4 w-4" /> },
  { href: '/email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { href: '/b2b', label: 'B2B', icon: <Building2 className="h-4 w-4" /> },
  { href: '/dropship', label: 'Dropship', icon: <Truck className="h-4 w-4" /> },
  { href: '/ai', label: 'AI', icon: <Sparkles className="h-4 w-4" /> },
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

  return (
    <div className="flex min-h-screen">
      <Sidebar className="hidden md:flex">
        <SidebarHeader>
          <Stack gap={0}>
            <Text weight="medium">Sparx</Text>
            <Text size="xs" variant="muted">
              Dashboard
            </Text>
          </Stack>
        </SidebarHeader>

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

        <SidebarFooter>
          <Stack direction="row" align="center" gap={2} className="px-2 py-1.5">
            <Avatar size="sm" alt={displayName} />
            <Stack gap={0} className="flex-1 min-w-0">
              <Text size="xs" weight="medium" className="truncate">
                {displayName}
              </Text>
              <Text size="xs" variant="muted" className="truncate">
                {user.email}
              </Text>
            </Stack>
          </Stack>
        </SidebarFooter>
      </Sidebar>

      <main className="flex flex-1 flex-col">
        <header className="flex h-12 items-center justify-end border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
          <UserMenu user={user} displayName={displayName} />
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
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
    await authClient.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" rightIcon={<ChevronDown className="h-3.5 w-3.5" />}>
          {displayName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signed in as {user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserIcon className="h-4 w-4" />
          Profile
          <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="h-4 w-4" />
          Settings
          <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
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
