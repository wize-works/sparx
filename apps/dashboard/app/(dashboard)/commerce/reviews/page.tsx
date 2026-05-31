import Link from 'next/link';
import { MessageSquare, Star } from 'lucide-react';

import {
  Badge,
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

import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

const STATUS_FILTERS: { value: ReviewStatus | 'queue' | undefined; label: string }[] = [
  { value: 'queue', label: 'Moderation queue' },
  { value: undefined, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'flagged', label: 'Flagged' },
];

interface ReviewCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface ReviewListRow {
  id: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  verifiedPurchase: boolean;
  createdAt: string;
  productTitle?: string | null;
  productHandle?: string | null;
  customer?: ReviewCustomer | null;
  // Only present on the /pending endpoint:
  displayName?: string | null;
  customerId?: string | null;
}

function authorLabel(row: ReviewListRow): string {
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

type Filter = { kind: 'queue' } | { kind: 'all' } | { kind: 'status'; status: ReviewStatus };

function parseFilter(raw: string | undefined): Filter {
  if (raw === undefined || raw === 'queue') return { kind: 'queue' };
  if (raw === 'all') return { kind: 'all' };
  if (raw === 'pending' || raw === 'approved' || raw === 'rejected' || raw === 'flagged') {
    return { kind: 'status', status: raw };
  }
  return { kind: 'queue' };
}

function labelFor(f: Filter): string {
  if (f.kind === 'queue') return 'Moderation queue';
  if (f.kind === 'all') return 'All reviews';
  return f.status.charAt(0).toUpperCase() + f.status.slice(1);
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; productId?: string }>;
}) {
  const { status: statusParam, productId } = await searchParams;
  const filter = parseFilter(statusParam);

  let rows: ReviewListRow[] = [];
  if (filter.kind === 'queue') {
    rows = await api.get<ReviewListRow[]>('/v1/commerce/reviews/pending');
  } else if (productId) {
    const params = new URLSearchParams({ take: '250' });
    if (filter.kind === 'status') params.set('status', filter.status);
    rows = await api.get<ReviewListRow[]>(
      `/v1/commerce/products/${productId}/reviews?${params.toString()}`
    );
  } else {
    const params = new URLSearchParams({ take: '250' });
    if (filter.kind === 'status') params.set('status', filter.status);
    rows = await api.get<ReviewListRow[]>(`/v1/commerce/reviews?${params.toString()}`);
  }

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Star className="h-5 w-5" />}
          title="Reviews"
          badge={<Badge color="module">{rows.length} shown</Badge>}
          description={
            <>
              Verified-purchase reviews auto-approve. Anonymous + non-verified land here for
              moderation. Approving fires <code>review.published</code> so the storefront cache
              invalidates.
            </>
          }
        />

        <Stack direction="row" gap={2} wrap>
          {STATUS_FILTERS.map((f) => (
            <FilterLink
              key={f.label}
              current={statusParam}
              value={f.value}
              label={f.label}
              productId={productId}
            />
          ))}
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{labelFor(filter)}</Heading>
              <CardDescription>
                Click a review to read the full body + media, respond as the merchant, or moderate.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-5 w-5" />}
                title="Nothing here"
                description="Reviews land here as customers submit them on storefront PDPs."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rating</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Stars value={r.rating} />
                      </TableCell>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/reviews/${r.id}`}
                          entityType="review"
                          entityId={r.id}
                          className="hover:text-[var(--module-active)]"
                        >
                          {r.title}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Text size="sm">
                          {r.productTitle ?? (
                            <span className="font-mono text-xs">{r.productId.slice(0, 8)}</span>
                          )}
                        </Text>
                      </TableCell>
                      <TableCell>{authorLabel(r)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        {r.verifiedPurchase ? (
                          <Badge color="success">verified</Badge>
                        ) : (
                          <Text size="xs" variant="muted">
                            —
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell>
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

function FilterLink({
  current,
  value,
  label,
  productId,
}: {
  current: string | undefined;
  value: ReviewStatus | 'queue' | undefined;
  label: string;
  productId: string | undefined;
}) {
  const isActive =
    current === value ||
    (current === undefined && value === 'queue') ||
    (current === 'queue' && value === 'queue');
  const params = new URLSearchParams();
  if (value && value !== 'queue') params.set('status', value);
  if (value === undefined) params.set('status', 'all');
  if (productId) params.set('productId', productId);
  const qs = params.toString();
  const href = `/commerce/reviews${qs ? `?${qs}` : ''}`;
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
  const variant: 'success' | 'warning' | 'outline' | 'danger' =
    status === 'approved'
      ? 'success'
      : status === 'flagged'
        ? 'warning'
        : status === 'rejected'
          ? 'danger'
          : 'outline';
  return <Badge color={variant}>{status}</Badge>;
}

function Stars({ value }: { value: number }) {
  return (
    <Stack direction="row" gap={0} align="center">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= value
              ? 'h-3.5 w-3.5 fill-[var(--module-active)] text-[var(--module-active)]'
              : 'h-3.5 w-3.5 text-[var(--color-text-muted)]'
          }
        />
      ))}
    </Stack>
  );
}
