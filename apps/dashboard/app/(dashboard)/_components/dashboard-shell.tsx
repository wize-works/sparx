'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Drawer,
  DrawerContent,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  ModuleProvider,
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
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
  ChevronDown,
  FileText,
  Home,
  LayoutTemplate,
  LogOut,
  Mail,
  Menu,
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

  const contentRef = React.useRef<HTMLDivElement>(null);
  const isFirstRender = React.useRef(true);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // H-4: Move focus to the content region on route change so keyboard users
  // don't have to re-traverse the sidebar. Skip the initial mount — the user
  // hasn't navigated yet and stealing focus on first paint is disorienting.
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setMobileNavOpen(false);
    contentRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const navSections = <NavSections pathname={pathname} />;
  const userCard = <UserCard user={user} displayName={displayName} />;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* C-3: Skip-link — first focusable element. Visually hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[var(--color-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-text-primary)] focus:shadow-md focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none"
      >
        Skip to content
      </a>

      <Sidebar className="hidden md:flex">
        <SidebarHeader>
          <Stack gap={0}>
            <Wordmark size={18} />
            <Text size="xs" variant="muted">
              Dashboard
            </Text>
          </Stack>
        </SidebarHeader>
        {navSections}
        <SidebarFooter>{userCard}</SidebarFooter>
      </Sidebar>

      {/* C-1: Mobile drawer mirrors the desktop sidebar tree. Auto-closes on
          route change (see useEffect above). */}
      <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DrawerContent side="left" className="flex w-72 max-w-[85vw] flex-col gap-1 p-3" hideClose>
          <DrawerTitle className="sr-only">Primary navigation</DrawerTitle>
          <SidebarHeader>
            <Stack gap={0}>
              <Wordmark size={18} />
              <Text size="xs" variant="muted">
                Dashboard
              </Text>
            </Stack>
          </SidebarHeader>
          {navSections}
          <SidebarFooter>{userCard}</SidebarFooter>
        </DrawerContent>
      </Drawer>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          <UserMenu user={user} displayName={displayName} />
        </header>
        <div
          ref={contentRef}
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function NavSections({ pathname }: { pathname: string | null }) {
  return (
    // H-3: nav landmark with a label so screen readers can jump straight here.
    <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
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
    </nav>
  );
}

function UserCard({
  user,
  displayName,
}: {
  user: DashboardShellProps['user'];
  displayName: string;
}) {
  return (
    <Stack direction="row" align="center" gap={2} className="px-2 py-1.5">
      <Avatar size="sm" alt={displayName} />
      <Stack gap={0} className="min-w-0 flex-1">
        <Text size="xs" weight="medium" className="truncate">
          {displayName}
        </Text>
        <Text size="xs" variant="muted" className="truncate">
          {user.email}
        </Text>
      </Stack>
    </Stack>
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
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Account menu for ${displayName}`}
          rightIcon={<ChevronDown className="h-3.5 w-3.5" />}
        >
          {displayName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
