import Link from 'next/link';
import { MessageSquare, PackageOpen, Star } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { reviewService } from '@sparx/commerce';
import type { ReviewModerationStatus } from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
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

import { ModuleStub } from '../../../../components/module-stub';
import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { value: ReviewModerationStatus | 'queue' | undefined; label: string }[] = [
  { value: 'queue', label: 'Moderation queue' },
  { value: undefined, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'flagged', label: 'Flagged' },
];

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; productId?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Product reviews."
        description="Activate the Commerce module from Billing to moderate reviews."
        features={[]}
      />
    );
  }

  const { status: statusParam, productId } = await searchParams;
  const filter = parseFilter(statusParam);
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // Two modes: "queue" surfaces pending+flagged together (the default
  // moderator view); any other status uses the per-product list. With
  // no productId set we fall back to a global tenant-wide query.
  const rows = await loadReviews(ctx, filter, productId);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Star className="h-5 w-5" />
            <Heading level={1}>Reviews</Heading>
            <Badge variant="module">{rows.length} shown</Badge>
          </Stack>
          <Text variant="muted">
            Verified-purchase reviews auto-approve. Anonymous + non-verified land here for
            moderation. Approving fires <code>review.published</code> so the storefront cache
            invalidates.
          </Text>
        </Stack>

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
                        <Text size="xs" className="font-mono">
                          {r.productId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>{r.displayName ?? (r.customerId ? 'Customer' : 'Anon')}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        {r.verifiedPurchase ? (
                          <Badge variant="success">verified</Badge>
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

type Filter =
  | { kind: 'queue' }
  | { kind: 'all' }
  | { kind: 'status'; status: ReviewModerationStatus };

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

async function loadReviews(
  ctx: { tenantId: string; userId: string },
  filter: Filter,
  productId: string | undefined
) {
  if (filter.kind === 'queue') {
    return reviewService.listPendingModeration(ctx);
  }
  if (productId) {
    const result = await reviewService.listReviewsForProduct(ctx, productId, {
      ...(filter.kind === 'status' ? { status: filter.status } : {}),
      take: 250,
    });
    return result.items;
  }
  // Tenant-wide query for All / by-status when no product is specified.
  // Bypass the per-product service helper since it requires productId.
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productReview.findMany({
      where: {
        deletedAt: null,
        ...(filter.kind === 'status' ? { status: filter.status } : {}),
      },
      include: { media: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      customerId: row.customerId,
      orderId: row.orderId,
      rating: row.rating,
      title: row.title,
      body: row.body,
      displayName: row.displayName,
      status: row.status as ReviewModerationStatus,
      verifiedPurchase: row.orderId !== null,
      helpfulCount: row.helpfulCount,
      unhelpfulCount: row.unhelpfulCount,
      response: row.response,
      respondedAt: row.respondedAt?.toISOString() ?? null,
      mediaAssetIds: row.media.map((m) => m.mediaAssetId),
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

function FilterLink({
  current,
  value,
  label,
  productId,
}: {
  current: string | undefined;
  value: ReviewModerationStatus | 'queue' | undefined;
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

function StatusBadge({ status }: { status: ReviewModerationStatus }) {
  const variant: 'success' | 'warning' | 'outline' | 'danger' =
    status === 'approved'
      ? 'success'
      : status === 'flagged'
        ? 'warning'
        : status === 'rejected'
          ? 'danger'
          : 'outline';
  return <Badge variant={variant}>{status}</Badge>;
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
