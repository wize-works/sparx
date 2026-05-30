import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { quoteService } from '@sparx/crm';
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

import { CrmTabs } from '../_components/crm-tabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  draft: 'outline',
  submitted: 'outline',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
  converted: 'success',
};

export default async function QuotesPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const status = stringParam(params.status);
  const q = stringParam(params.q);

  const { items: quotes, total } = await quoteService.list(
    { tenantId: session.user.tenantId, userId: session.user.id },
    {
      take: 100,
      sortBy: 'createdAt',
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
    }
  );

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="quotes" />
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <FileText className="h-5 w-5" />
              <Heading level={1}>Quotes</Heading>
              <Badge variant="module">
                {total} quote{total === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Sales quotes — draft, submitted, accepted, declined, expired, converted to an order.
              Accepted quotes convert atomically to a new Order via the quote detail page.
            </Text>
          </Stack>
          <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/crm/quotes/new">New quote</Link>
          </Button>
        </Stack>

        {quotes.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No quotes match"
              description="Quotes appear here once created. Start one from a deal or directly here."
            />
          </Card>
        ) : (
          <Card padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Valid until</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link
                          href={`/crm/quotes/${q.id}`}
                          className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                        >
                          {q.quoteNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[q.status] ?? 'outline'} className="text-xs">
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {q.currency} {Number(q.total).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {q.validUntil?.toLocaleDateString() ?? '—'}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {q.createdAt.toLocaleDateString()}
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
