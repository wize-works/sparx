// Email section sub-nav. Server component so every page renders it without a
// client island just to highlight the active tab. Each page passes `current`
// explicitly — same convention as CrmTabs / CmsTabs.

import Link from 'next/link';
import { Badge, Stack, cn } from '@sparx/ui';

export type EmailSection =
  | 'overview'
  | 'broadcasts'
  | 'automations'
  | 'templates'
  | 'suppressions'
  | 'domains'
  | 'settings';

interface EmailTabsProps {
  current: EmailSection;
}

const TABS: { section: EmailSection; href: string; label: string }[] = [
  { section: 'overview', href: '/email', label: 'Overview' },
  { section: 'broadcasts', href: '/email/broadcasts', label: 'Broadcasts' },
  { section: 'automations', href: '/email/automations', label: 'Automations' },
  { section: 'templates', href: '/email/templates', label: 'Templates' },
  { section: 'suppressions', href: '/email/suppressions', label: 'Suppressions' },
  { section: 'domains', href: '/email/domains', label: 'Sending domains' },
  { section: 'settings', href: '/email/settings', label: 'Settings' },
];

export function EmailTabs({ current }: EmailTabsProps) {
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
