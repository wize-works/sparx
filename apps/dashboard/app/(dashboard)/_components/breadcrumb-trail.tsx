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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ModuleProvider,
  type SparxModule,
} from '@sparx/ui';
import { LogOut, Settings as SettingsIcon } from 'lucide-react';
import { findSectionByPath, getManifestForPath, moduleManifests } from '../_shell/registry';

// Tenant > Module > Section > Page
//
// Clickable segments open a popover with relevant children:
//   - Tenant: workspace shortcut + settings + sign out
//   - Module: list of the module's sections (lateral nav, no go-back)
//   - Section: navigate-only (sections are leaf in Phase 1)
// The current page (rightmost) is non-interactive (it IS the current
// surface — clicking does nothing).
//
// Responsive: a ResizeObserver compares full content width against
// container width. When overflow is detected, middle segments collapse to
// a `…` chip whose own popover lists the hidden segments. Tenant and
// page (first + last) are never hidden.

type TrailSegment =
  | { kind: 'tenant'; label: string; href: string }
  | { kind: 'module'; label: string; href: string; moduleId: Exclude<SparxModule, 'platform'> }
  | { kind: 'section'; label: string; href: string };

export interface BreadcrumbTrailProps {
  tenantName: string;
}

export function BreadcrumbTrail({ tenantName }: BreadcrumbTrailProps) {
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

  const collapseState = useResponsiveCollapse(segments.length);

  // Build the visible trail. Anything in `collapseState.hiddenIndexes` is
  // suppressed; a single `…` chip is rendered in its place.
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
                {isLast ? (
                  <BreadcrumbPage className="truncate">{seg.label}</BreadcrumbPage>
                ) : (
                  <SegmentWithPopover seg={seg} />
                )}
              </BreadcrumbItem>
              {!isVisuallyLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

// ── Segment with popover ───────────────────────────────────

function SegmentWithPopover({ seg }: { seg: TrailSegment }) {
  // The Section kind has no children to surface in Phase 1 — render as a
  // plain link, no popover, no chevron.
  if (seg.kind === 'section') {
    return (
      <BreadcrumbLink asChild className="truncate">
        <Link href={seg.href}>{seg.label}</Link>
      </BreadcrumbLink>
    );
  }

  const trigger =
    seg.kind === 'module' ? (
      <ModuleProvider module={seg.moduleId}>
        <Button variant="ghost" size="sm" style={{ color: 'var(--module-active-text)' }}>
          {seg.label}
        </Button>
      </ModuleProvider>
    ) : (
      <Button variant="ghost" size="sm">
        {seg.label}
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {seg.kind === 'tenant' ? (
          <TenantMenuBody tenantName={seg.label} />
        ) : (
          <ModuleMenuBody moduleId={seg.moduleId} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TenantMenuBody({ tenantName }: { tenantName: string }) {
  return (
    <>
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
    </>
  );
}

function ModuleMenuBody({ moduleId }: { moduleId: Exclude<SparxModule, 'platform'> }) {
  const manifest = moduleManifests.find((m) => m.id === moduleId);
  if (!manifest || manifest.sections.length === 0) {
    return <DropdownMenuLabel>No sections yet.</DropdownMenuLabel>;
  }
  return (
    <>
      {manifest.sections.map((section) => {
        const Icon = section.icon;
        return (
          <DropdownMenuItem key={section.id} asChild>
            <Link href={section.href}>
              <Icon className="h-4 w-4" />
              {section.label}
            </Link>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

// ── Hidden-segments popover ────────────────────────────────

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

// ── Responsive collapse ────────────────────────────────────

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
