import Link from 'next/link';
import { Users, Plus, Building2, UserPlus } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { EntityRowLink } from '../_components/entity-row-link';
import { CrmTabs } from './_components/crm-tabs';
import { CustomerFiltersBar } from './_components/customer-filters-bar';

interface CustomerListRow {
  id: string;
  type: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  doNotContact: boolean;
  orderCount: number;
  totalSpent: string | number;
  lastOrderAt: string | null;
  updatedAt: string;
}

// CRM landing — customer list with filter bar.
//
// Filter state lives in the URL (?type=b2b&tag=fleet&q=acme) so links and
// the browser back-button work, and so saved-view objects can serialize
// straight from the query string.
//
// The CRM module gate runs in layout.tsx — if the tenant doesn't have CRM
// active, this page never executes (the layout returns ModuleStub instead).

export const dynamic = 'force-dynamic';

const TYPE_LABELS = {
  prospect: 'Prospect',
  retail: 'Customer',
  b2b: 'B2B contact',
} as const;

const VALID_SORTS = ['updatedAt', 'createdAt', 'totalSpent', 'lastOrderAt'] as const;
type SortKey = (typeof VALID_SORTS)[number];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CrmPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const type = stringParam(params.type);
  const tag = stringParam(params.tag);
  const q = stringParam(params.q);
  const sort = (VALID_SORTS as readonly string[]).includes(stringParam(params.sort) ?? '')
    ? (stringParam(params.sort) as SortKey)
    : ('updatedAt' satisfies SortKey);

  const query = new URLSearchParams();
  query.set('take', '100');
  query.set('sort_by', sort);
  if (type === 'prospect' || type === 'retail' || type === 'b2b') query.set('type', type);
  if (tag) query.set('tag', tag);
  if (q) query.set('q', q);

  const { data: customers, meta } = await api.getPaged<CustomerListRow[]>(
    `/v1/crm/customers?${query.toString()}`
  );
  const total = (meta?.total as number | undefined) ?? customers.length;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="customers" />
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Users className="h-5 w-5" />
              <Heading level={1}>CRM</Heading>
              <Badge variant="module">
                {total} customer{total === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Customer intelligence for the whole platform — orders, segments, deals, and activity.
            </Text>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button asChild variant="secondary">
              <Link href="/crm/duplicates">Find duplicates</Link>
            </Button>
            <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/crm/customers/new">New customer</Link>
            </Button>
          </Stack>
        </Stack>

        <CustomerFiltersBar
          currentType={type}
          currentTag={tag}
          currentQuery={q}
          currentSort={sort}
        />

        {customers.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="No customers match"
              description="Adjust the filters above, or add a new customer manually."
              action={
                <Button asChild variant="module">
                  <Link href="/crm/customers/new">Add a customer</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Card padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead>Last order</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/crm/customers/${c.id}`}
                          entityType="customer"
                          entityId={c.id}
                          className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--module-active)] hover:underline"
                        >
                          {customerDisplayName(c)}
                        </EntityRowLink>
                        {c.doNotContact && (
                          <Badge variant="warning" className="ml-2">
                            DNC
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {TYPE_LABELS[c.type as keyof typeof TYPE_LABELS] ?? c.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.company ? (
                          <Stack direction="row" align="center" gap={1}>
                            <Building2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                            <Text size="sm">{c.company}</Text>
                          </Stack>
                        ) : (
                          <Text size="sm" variant="muted">
                            —
                          </Text>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${Number(c.totalSpent).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function customerDisplayName(c: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}): string {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (c.company) return c.company;
  if (c.email) return c.email;
  return 'Unnamed customer';
}
