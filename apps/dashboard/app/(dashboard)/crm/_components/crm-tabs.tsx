// CRM section sub-nav. Server component so every page renders it without
// a client island just to highlight the active tab. Each page passes
// `current` explicitly — same convention as `CmsTabs`.

import Link from 'next/link';
import { Badge, Stack, cn } from '@sparx/ui';

export type CrmSection =
  | 'customers'
  | 'pipelines'
  | 'segments'
  | 'tasks'
  | 'b2b'
  | 'orders'
  | 'quotes'
  | 'reports'
  | 'duplicates';

interface CrmTabsProps {
  current: CrmSection;
}

const TABS: { section: CrmSection; href: string; label: string }[] = [
  { section: 'customers', href: '/crm', label: 'Customers' },
  { section: 'pipelines', href: '/crm/pipelines', label: 'Pipelines' },
  { section: 'segments', href: '/crm/segments', label: 'Segments' },
  { section: 'tasks', href: '/crm/tasks', label: 'Tasks' },
  { section: 'b2b', href: '/crm/b2b', label: 'B2B accounts' },
  { section: 'orders', href: '/crm/orders', label: 'Orders' },
  { section: 'quotes', href: '/crm/quotes', label: 'Quotes' },
  { section: 'reports', href: '/crm/reports', label: 'Reports' },
  { section: 'duplicates', href: '/crm/duplicates', label: 'Duplicates' },
];

export function CrmTabs({ current }: CrmTabsProps) {
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
