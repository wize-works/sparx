'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Drawer,
  DrawerContent,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ModuleProvider,
  Stack,
  Text,
  type SparxModule,
} from '@sparx/ui';
import { Check, ChevronDown, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { findSectionByPath, getManifestForPath, moduleManifests } from '../_shell/registry';

// Workspace > Module > Section > Page
//
// The trail has two interactive controls plus navigate-only links:
//   - Workspace (segment 1): the tenant. Menu → settings + sign out. Switch /
//     create land in Phase 2 (docs/32) once the org plugin is enabled.
//   - Module (segment 2): a SPLIT control. The label links to the module home;
//     an adjacent ▾ opens a switcher listing the OTHER modules the tenant has
//     enabled (active one checked, accent-colored). This deviates from the
//     original §4.2 (which listed the module's sections) — sections now live in
//     the sidebar and as segment 3. See docs/24 §4.2 + docs/32.
//   - Section (segment 3): navigate-only link; the current page is plain text.
//
// Responsive: on md+ the inline trail renders with overflow-collapse to a `…`
// popover. Below md the whole trail condenses to a single context chip that
// opens a bottom sheet with Workspace / Module / Section groups — every switch
// is a full-width touch row. Desktop/mobile are toggled by Tailwind `md:`
// visibility (both in the DOM) so there is no first-paint flash from a media
// query resolving after mount.

type Manifest = (typeof moduleManifests)[number];

type TrailSegment =
  | { kind: 'tenant'; label: string; href: string }
  | { kind: 'module'; label: string; href: string; moduleId: Exclude<SparxModule, 'platform'> }
  | { kind: 'section'; label: string; href: string };

export interface BreadcrumbTrailProps {
  tenantName: string;
  /** Module manifest ids the tenant has activated. Filters the switcher so a
   *  tenant never sees a module it hasn't enabled. */
  enabledModules: readonly string[];
}

export function BreadcrumbTrail({ tenantName, enabledModules }: BreadcrumbTrailProps) {
  const pathname = usePathname() ?? '/';
  const manifest = getManifestForPath(pathname);
  const section = findSectionByPath(pathname);

  const segments: TrailSegment[] = [{ kind: 'tenant', label: tenantName, href: '/' }];
  if (manifest) {
    segments.push({
      kind: 'module',
      label: manifest.label,
      href: manifest.routePrefix,
      moduleId: manifest.id,
    });
  }
  if (section) {
    segments.push({ kind: 'section', label: section.label, href: section.href });
  }

  // Modules offered in the switcher: the enabled set, plus the current module
  // if (somehow) it isn't in that set — you should always be able to see where
  // you are and switch away from it.
  const switchableModules = React.useMemo(() => {
    const list = moduleManifests.filter((m) => enabledModules.includes(m.id));
    if (manifest && !list.some((m) => m.id === manifest.id)) return [manifest, ...list];
    return list;
  }, [enabledModules, manifest]);

  return (
    <>
      <div className="hidden min-w-0 md:block">
        <DesktopTrail
          segments={segments}
          manifest={manifest}
          switchableModules={switchableModules}
        />
      </div>
      <div className="min-w-0 md:hidden">
        <MobileSwitcher
          tenantName={tenantName}
          manifest={manifest}
          activeSectionHref={section?.href ?? null}
          switchableModules={switchableModules}
        />
      </div>
    </>
  );
}

// ── Desktop inline trail ───────────────────────────────────

function DesktopTrail({
  segments,
  manifest,
  switchableModules,
}: {
  segments: TrailSegment[];
  manifest: Manifest | undefined;
  switchableModules: Manifest[];
}) {
  const collapseState = useResponsiveCollapse(segments.length);

  const lastIndex = segments.length - 1;
  const visible: { index: number; kind: 'segment' | 'ellipsis' }[] = [];
  let inserted = false;
  for (let i = 0; i < segments.length; i += 1) {
    if (collapseState.hiddenIndexes.has(i)) {
      if (!inserted) {
        visible.push({ index: i, kind: 'ellipsis' });
        inserted = true;
      }
      continue;
    }
    visible.push({ index: i, kind: 'segment' });
    inserted = false;
  }

  return (
    <Breadcrumb className="min-w-0" ref={collapseState.containerRef}>
      <BreadcrumbList
        className="flex-nowrap overflow-hidden"
        ref={collapseState.contentRef as React.Ref<HTMLOListElement>}
      >
        {visible.map((v, i) => {
          const isVisuallyLast = i === visible.length - 1;
          if (v.kind === 'ellipsis') {
            const hiddenSegments = Array.from(collapseState.hiddenIndexes)
              .sort((a, b) => a - b)
              .map((idx) => segments[idx])
              .filter((s): s is TrailSegment => Boolean(s));
            return (
              <React.Fragment key={`ellipsis-${v.index}`}>
                <BreadcrumbItem>
                  <HiddenSegmentsPopover segments={hiddenSegments} />
                </BreadcrumbItem>
                {!isVisuallyLast && <BreadcrumbSeparator />}
              </React.Fragment>
            );
          }
          const seg = segments[v.index];
          if (!seg) return null;
          const isLast = v.index === lastIndex;
          return (
            <React.Fragment key={`${seg.kind}-${seg.href}`}>
              <BreadcrumbItem className="min-w-0">
                <SegmentContent
                  seg={seg}
                  isLast={isLast}
                  manifest={manifest}
                  switchableModules={switchableModules}
                />
              </BreadcrumbItem>
              {!isVisuallyLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function SegmentContent({
  seg,
  isLast,
  manifest,
  switchableModules,
}: {
  seg: TrailSegment;
  isLast: boolean;
  manifest: Manifest | undefined;
  switchableModules: Manifest[];
}) {
  if (seg.kind === 'tenant') {
    return <WorkspaceSegment tenantName={seg.label} />;
  }
  if (seg.kind === 'module' && manifest) {
    // Module stays interactive even when it is the current page — switching is
    // its whole purpose.
    return <ModuleSplitControl manifest={manifest} switchableModules={switchableModules} />;
  }
  // Section: navigate-only. The current page is non-interactive text.
  return isLast ? (
    <BreadcrumbPage className="truncate">{seg.label}</BreadcrumbPage>
  ) : (
    <BreadcrumbLink asChild className="truncate">
      <Link href={seg.href}>{seg.label}</Link>
    </BreadcrumbLink>
  );
}

// Workspace control. Phase 1: settings + sign out. Switch/create workspace
// land in Phase 2 with the Better Auth org plugin (docs/32).
function WorkspaceSegment({ tenantName }: { tenantName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-w-0">
          <span className="min-w-0 truncate">{tenantName}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{tenantName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="h-4 w-4" />
            Workspace settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/sign-out">
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Split control: label → module home, ▾ → module switcher.
function ModuleSplitControl({
  manifest,
  switchableModules,
}: {
  manifest: Manifest;
  switchableModules: Manifest[];
}) {
  return (
    <ModuleProvider module={manifest.id} className="contents">
      <span className="inline-flex min-w-0 items-center">
        <BreadcrumbLink asChild className="truncate">
          <Link href={manifest.routePrefix} style={{ color: 'var(--module-active-text)' }}>
            {manifest.label}
          </Link>
        </BreadcrumbLink>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-0.5"
              aria-label={`Switch module — current: ${manifest.label}`}
              style={{ color: 'var(--module-active-text)' }}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Switch module</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {switchableModules.map((m) => {
              const Icon = m.icon;
              const active = m.id === manifest.id;
              return (
                <DropdownMenuItem key={m.id} asChild>
                  <Link href={m.routePrefix}>
                    <ModuleProvider module={m.id} className="contents">
                      <Icon className="h-4 w-4" style={{ color: 'var(--module-active-text)' }} />
                    </ModuleProvider>
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </ModuleProvider>
  );
}

// ── Hidden-segments popover (desktop overflow) ─────────────

function HiddenSegmentsPopover({ segments }: { segments: TrailSegment[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Show hidden segments">
          <BreadcrumbEllipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {segments.map((s) => (
          <DropdownMenuItem key={`${s.kind}-${s.href}`} asChild>
            <Link href={s.href}>{s.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Mobile condensed switcher ──────────────────────────────

function MobileSwitcher({
  tenantName,
  manifest,
  activeSectionHref,
  switchableModules,
}: {
  tenantName: string;
  manifest: Manifest | undefined;
  activeSectionHref: string | null;
  switchableModules: Manifest[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the sheet after a navigation completes.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const chipLabel = manifest?.label ?? tenantName;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="max-w-full min-w-0"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        {manifest ? (
          <ModuleProvider module={manifest.id} className="contents">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--module-active)' }}
            />
          </ModuleProvider>
        ) : null}
        <span className="min-w-0 truncate">{chipLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent side="bottom" className="h-auto max-h-[85vh] rounded-t-xl pt-2">
          <DrawerTitle className="sr-only">Navigate</DrawerTitle>
          <div className="overflow-y-auto pb-2">
            <Stack gap={1}>
              <SheetGroupLabel>Workspace</SheetGroupLabel>
              <SheetRow active>{tenantName}</SheetRow>
              <SheetRow href="/settings" icon={<SettingsIcon className="h-4 w-4" />}>
                Workspace settings
              </SheetRow>
              <SheetRow href="/sign-out" icon={<LogOut className="h-4 w-4" />}>
                Sign out
              </SheetRow>

              {switchableModules.length > 0 ? (
                <>
                  <SheetGroupLabel>Modules</SheetGroupLabel>
                  {switchableModules.map((m) => {
                    const Icon = m.icon;
                    return (
                      <SheetRow
                        key={m.id}
                        href={m.routePrefix}
                        active={m.id === manifest?.id}
                        icon={
                          <ModuleProvider module={m.id} className="contents">
                            <Icon
                              className="h-4 w-4"
                              style={{ color: 'var(--module-active-text)' }}
                            />
                          </ModuleProvider>
                        }
                      >
                        {m.label}
                      </SheetRow>
                    );
                  })}
                </>
              ) : null}

              {manifest && manifest.sections.length > 0 ? (
                <>
                  <SheetGroupLabel>{manifest.label} pages</SheetGroupLabel>
                  {manifest.sections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <SheetRow
                        key={s.id}
                        href={s.href}
                        active={s.href === activeSectionHref}
                        icon={<Icon className="h-4 w-4" />}
                      >
                        {s.label}
                      </SheetRow>
                    );
                  })}
                </>
              ) : null}
            </Stack>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SheetGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" variant="muted" weight="medium" className="px-3 pt-3 pb-1">
      {children}
    </Text>
  );
}

// A full-width touch row. With `href` it navigates; without, it's a static
// (current-context) row. `active` shows a trailing check.
function SheetRow({
  href,
  icon,
  active = false,
  children,
}: {
  href?: string;
  icon?: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <Text as="span" size="sm" className="min-w-0 flex-1 truncate">
        {children}
      </Text>
      {active ? <Check className="h-4 w-4 shrink-0" /> : null}
    </>
  );

  if (!href) {
    // Static current-context row (no nav). `flex-1` on the label pushes the
    // check to the end, so no explicit gap is needed.
    return <div className="flex h-10 items-center px-3">{body}</div>;
  }

  return (
    <Button variant="ghost" asChild className="h-10 w-full justify-start gap-3 px-3">
      <Link href={href}>{body}</Link>
    </Button>
  );
}

// ── Responsive collapse (desktop) ──────────────────────────

interface CollapseState {
  hiddenIndexes: Set<number>;
  containerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLElement | null>;
}

function useResponsiveCollapse(segmentCount: number): CollapseState {
  const containerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLElement | null>(null);
  const [hiddenCount, setHiddenCount] = React.useState(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const containerWidth = container.clientWidth;
      const contentWidth = contentRef.current?.scrollWidth ?? 0;
      if (contentWidth > containerWidth && segmentCount > 2) {
        // Hide one more middle segment per overflow tick, up to N-2 (always
        // keep first + last). We do not measure precise per-segment widths;
        // the layout reflows on the next ResizeObserver fire and converges.
        setHiddenCount((prev) => Math.min(prev + 1, segmentCount - 2));
      } else if (contentWidth < containerWidth * 0.85 && hiddenCount > 0) {
        // Generous expand threshold so we don't oscillate at the boundary.
        setHiddenCount((prev) => Math.max(0, prev - 1));
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [segmentCount, hiddenCount]);

  // Indexes 1..(hiddenCount) are hidden (always preserving 0 and last).
  const hiddenIndexes = React.useMemo(() => {
    const s = new Set<number>();
    for (let i = 1; i <= hiddenCount; i += 1) s.add(i);
    return s;
  }, [hiddenCount]);

  return { hiddenIndexes, containerRef, contentRef };
}
