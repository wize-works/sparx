// CMS section sub-nav. Server component so every page can render it
// without paying for a client island just to highlight the active tab.
// Each page passes `current` explicitly — keeping it explicit (rather than
// reading from `usePathname`) means we don't fight Next's client-component
// boundary for what is otherwise a stateless link group.

import Link from 'next/link';
import { Badge, Stack } from '@sparx/ui';
import { cn } from '@sparx/ui';

export type CmsSection =
  | 'pages'
  | 'types'
  | 'navigation'
  | 'media'
  | 'redirects'
  | 'authors'
  | 'taxonomy'
  | 'webhooks';

interface CmsTabsProps {
  current: CmsSection;
}

const TABS: { section: CmsSection; href: string; label: string }[] = [
  { section: 'pages', href: '/cms', label: 'Pages' },
  { section: 'types', href: '/cms/types', label: 'Content types' },
  { section: 'navigation', href: '/cms/navigation', label: 'Navigation' },
  { section: 'media', href: '/cms/media', label: 'Media' },
  { section: 'redirects', href: '/cms/redirects', label: 'Redirects' },
  { section: 'authors', href: '/cms/authors', label: 'Authors' },
  { section: 'taxonomy', href: '/cms/taxonomy', label: 'Taxonomy' },
  { section: 'webhooks', href: '/cms/webhooks', label: 'Webhooks' },
];

export function CmsTabs({ current }: CmsTabsProps) {
  return (
    <Stack direction="row" gap={1} className="border-b border-[var(--color-border-default)] pb-px">
      {TABS.map((tab) => {
        const active = tab.section === current;
        return (
          <Link
            key={tab.section}
            href={tab.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
              active
                ? 'border-b-2 border-[var(--module-active)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
            {active && <Badge variant="module">active</Badge>}
          </Link>
        );
      })}
    </Stack>
  );
}
