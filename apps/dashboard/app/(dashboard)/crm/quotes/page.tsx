import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
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

import { EntityRowLink } from '../../_components/entity-row-link';

interface QuoteRow {
  id: string;
  quoteNumber: string;
  status: string;
  currency: string;
  total: string | number;
  validUntil: string | null;
  createdAt: string;
}

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
  const params = await searchParams;
  const status = stringParam(params.status);
  const q = stringParam(params.q);

  const query = new URLSearchParams({ take: '100', sort_by: 'createdAt' });
  if (status) query.set('status', status);
  if (q) query.set('q', q);

  const { data: quotes, meta } = await api.getPaged<QuoteRow[]>(
    `/v1/crm/quotes?${query.toString()}`
  );
  const total = (meta?.total as number | undefined) ?? quotes.length;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<FileText className="h-5 w-5" />}
          title="Quotes"
          badge={
            <Badge color="module">
              {total} quote{total === 1 ? '' : 's'}
            </Badge>
          }
          description="Sales quotes — draft, submitted, accepted, declined, expired, converted to an order. Accepted quotes convert atomically to a new Order via the quote detail page."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/crm/quotes/new">New quote</Link>
            </Button>
          }
        />

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
                        <EntityRowLink
                          href={`/crm/quotes/${q.id}`}
                          entityType="quote"
                          entityId={q.id}
                          className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                        >
                          {q.quoteNumber}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Badge color={STATUS_VARIANT[q.status] ?? 'outline'} className="text-xs">
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {q.currency} {Number(q.total).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '—'}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {new Date(q.createdAt).toLocaleDateString()}
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
