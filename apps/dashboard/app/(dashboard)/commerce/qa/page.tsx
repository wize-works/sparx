import Link from 'next/link';
import { HelpCircle } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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

import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'Pending' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

interface QuestionCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface QuestionListRow {
  id: string;
  productId: string;
  body: string;
  status: string;
  createdAt: string;
  productTitle: string | null;
  productHandle: string | null;
  customer: QuestionCustomer | null;
  // Only present in the pending endpoint:
  displayName?: string | null;
  customerId?: string | null;
  answers?: unknown[];
}

interface DisplayRow {
  id: string;
  productId: string;
  body: string;
  status: string;
  createdAt: string;
  authorLabel: string;
  productTitle: string | null;
  answerCount: number | null;
}

function authorLabel(row: QuestionListRow): string {
  if (row.displayName) return row.displayName;
  if (row.customer) {
    const full = `${row.customer.firstName ?? ''} ${row.customer.lastName ?? ''}`.trim();
    if (full) return full;
    if (row.customer.email) return row.customer.email;
    return 'Customer';
  }
  if (row.customerId) return 'Customer';
  return 'Anon';
}

export default async function QaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;

  let rows: DisplayRow[] = [];
  if (statusParam === undefined) {
    const list = await api.get<QuestionListRow[]>('/v1/commerce/questions/pending');
    rows = list.map((q) => ({
      id: q.id,
      productId: q.productId,
      body: q.body,
      status: q.status,
      createdAt: q.createdAt,
      authorLabel: authorLabel(q),
      productTitle: q.productTitle ?? null,
      answerCount: Array.isArray(q.answers) ? q.answers.length : null,
    }));
  } else {
    const qs = statusParam === 'all' ? '?take=250' : `?status=${statusParam}&take=250`;
    const list = await api.get<QuestionListRow[]>(`/v1/commerce/questions${qs}`);
    rows = list.map((q) => ({
      id: q.id,
      productId: q.productId,
      body: q.body,
      status: q.status,
      createdAt: q.createdAt,
      authorLabel: authorLabel(q),
      productTitle: q.productTitle ?? null,
      answerCount: null,
    }));
  }

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <HelpCircle className="h-5 w-5" />
            <Heading level={1}>Questions &amp; answers</Heading>
            <Badge color="module">{rows.length} shown</Badge>
          </Stack>
          <Text variant="muted">
            Customer questions are moderated before they reach the storefront. Answering with the
            staff badge marks the response as official; community answers can land too once the
            question is published.
          </Text>
        </Stack>

        <Stack direction="row" gap={2} wrap>
          {STATUS_FILTERS.map((f) => (
            <FilterLink key={f.label} current={statusParam} value={f.value} label={f.label} />
          ))}
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{labelFor(statusParam)}</Heading>
              <CardDescription>
                Click a question to publish or reject, and post an official answer.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                icon={<HelpCircle className="h-5 w-5" />}
                title="No questions"
                description="Questions arrive here once the storefront PDP starts accepting them."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Answers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Asked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/qa/${q.id}`}
                          entityType="qa-question"
                          entityId={q.id}
                          className="hover:text-[var(--module-active)]"
                        >
                          {truncate(q.body, 80)}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Text size="sm">
                          {q.productTitle ?? (
                            <span className="font-mono text-xs">{q.productId.slice(0, 8)}</span>
                          )}
                        </Text>
                      </TableCell>
                      <TableCell>{q.authorLabel}</TableCell>
                      <TableCell>{q.answerCount ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge status={q.status} />
                      </TableCell>
                      <TableCell>{new Date(q.createdAt).toLocaleDateString()}</TableCell>
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

function labelFor(s: string | undefined): string {
  if (s === undefined) return 'Pending';
  if (s === 'all') return 'All questions';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const isActive = current === value;
  const href = value ? `/commerce/qa?status=${value}` : '/commerce/qa';
  return (
    <Link
      href={href}
      className={
        isActive
          ? 'rounded bg-[var(--module-active)] px-3 py-1 text-xs text-white'
          : 'rounded border border-[var(--color-border-default)] px-3 py-1 text-xs hover:bg-[var(--color-bg-subtle)]'
      }
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: 'success' | 'outline' | 'danger' =
    status === 'published' ? 'success' : status === 'rejected' ? 'danger' : 'outline';
  return <Badge color={variant}>{status}</Badge>;
}
