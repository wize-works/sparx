'use client';

import * as React from 'react';
import Link from 'next/link';
import { SidebarItem } from '@sparx/ui';
import type { ModuleManifest } from '@sparx/ui/shell';

// A module's intra-module navigation items: an "Overview" entry (the module
// root) followed by every section from the manifest. The active item adopts
// the module color via the caller's wrapping ModuleProvider.
//
// Items only — no <nav>, no ModuleProvider. The desktop contextual panel wraps
// these in a scrolling, module-colored <nav>; the mobile drawer drops them into
// a labeled section. One section list, two layouts. See docs/34 §11.

function isWithin(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ModuleSectionItems({
  manifest,
  pathname,
}: {
  manifest: ModuleManifest;
  pathname: string | null;
}) {
  const Overview = manifest.icon;
  return (
    <>
      <SidebarItem
        asChild
        active={pathname === manifest.routePrefix}
        icon={<Overview className="h-4 w-4" />}
      >
        <Link href={manifest.routePrefix}>Overview</Link>
      </SidebarItem>
      {manifest.sections.map((section) => {
        const Icon = section.icon;
        // The module root is "Overview"; a section is active only when the path
        // is the section itself or a descendant — never the bare root.
        const active = pathname !== manifest.routePrefix && isWithin(pathname, section.href);
        return (
          <SidebarItem key={section.id} asChild active={active} icon={<Icon className="h-4 w-4" />}>
            <Link href={section.href}>{section.label}</Link>
          </SidebarItem>
        );
      })}
    </>
  );
}
