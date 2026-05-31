import Link from 'next/link';
import { Plus, Tag } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  PageHeader,
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

import { DiscountStatusToggle } from './_components/discount-status-toggle';

interface DiscountRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: string;
  scope: string;
  valueCents: number | null;
  valuePercent: number | null;
  currency: string | null;
  conditions: unknown[];
  startAt: string | null;
  endAt: string | null;
  totalUsageLimit: number | null;
  perCustomerLimit: number;
  stacking: string;
  priority: number;
  status: string;
  usageCount: number;
  updatedAt: string;
}

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default async function DiscountsPage() {
  const discounts = await api.get<DiscountRow[]>('/v1/commerce/discounts');

  const active = discounts.filter((d) => d.status === 'active');
  const draft = discounts.filter((d) => d.status === 'draft');

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Tag className="h-5 w-5" />}
          title="Discounts"
          badge={
            <Badge color="module">
              {active.length} active · {draft.length} draft
            </Badge>
          }
          description="Codes activate when a shopper enters them; automatic discounts apply silently when their conditions match. Stacking rules govern combining with subscribe-and-save and loyalty."
          actions={
            <Button color="module" asChild>
              <Link href="/commerce/discounts/new">
                <Plus className="h-4 w-4" />
                Create discount
              </Link>
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>All discounts</Heading>
              <CardDescription>
                Higher-priority discounts evaluate first when multiple are eligible. Per-customer
                limits and total caps are enforced at redemption time.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {discounts.length === 0 ? (
              <EmptyState
                icon={<Tag className="h-5 w-5" />}
                title="No discounts yet"
                description="Create a code (e.g. WELCOME10) for new-customer promos, or an automatic discount that applies when conditions are met."
                action={
                  <Button color="module" asChild>
                    <Link href="/commerce/discounts/new">Create discount</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code / Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Stack gap={0}>
                          {d.code ? (
                            <span className="font-mono text-xs">{d.code}</span>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              automatic
                            </Badge>
                          )}
                          <Text size="xs" variant="muted">
                            {d.name}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{d.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {d.type === 'percent' && `${d.valuePercent}%`}
                        {d.type === 'fixed' && moneyFmt.format((d.valueCents ?? 0) / 100)}
                        {d.type === 'free_shipping' && 'free shipping'}
                        {d.type === 'buy_x_get_y' && 'BOGO'}
                        {d.type === 'bundle' && 'bundle'}
                      </TableCell>
                      <TableCell>
                        {d.usageCount}
                        {d.totalUsageLimit !== null ? ` / ${d.totalUsageLimit}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge color={STATUS_VARIANT[d.status] ?? 'outline'}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <DiscountStatusToggle discountId={d.id} status={d.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
