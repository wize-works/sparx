import Link from 'next/link';
import { PackageOpen, Plus, Search } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
  Heading,
  Input,
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

interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  variantCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  updatedAt: string;
}

// Products index — list view + filter chips + search. Filters live in the
// query string so saved views / shared links serialize cleanly.
//
// Phase 1.1 surfaces title / handle / status / vendor / tags / variant
// count / updated-at. Price columns light up in Phase 1.2 once variants
// land (price_min_cents / price_max_cents are populated by the
// commerce-indexer worker watching variant.* events).

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = parseStatus(stringParam(params.status));
  const vendor = stringParam(params.vendor);
  const tag = stringParam(params.tag);
  const productType = stringParam(params.type);
  const q = stringParam(params.q);
  const includeArchived = stringParam(params.archived) === '1';

  const query = new URLSearchParams({
    take: '100',
    sort_by: 'updatedAt',
    ...(includeArchived ? { include_archived: 'true' } : {}),
    ...(status ? { status } : {}),
    ...(vendor ? { vendor } : {}),
    ...(tag ? { tag } : {}),
    ...(productType ? { product_type: productType } : {}),
    ...(q ? { q } : {}),
  });

  const { data: products, meta } = await api.getPaged<ProductListItem[]>(
    `/v1/commerce/products?${query.toString()}`
  );
  const total = (meta?.total as number | undefined) ?? products.length;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <PackageOpen className="h-5 w-5" />
              <Heading level={1}>Products</Heading>
              <Badge color="module">
                {total} product{total === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Your catalog. Variants, options, fitment, and configurator templates hang off each
              product. Draft → Active publishes to the storefront; archived rows stay searchable but
              render as 410.
            </Text>
          </Stack>
          <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/commerce/products/new">New product</Link>
          </Button>
        </Stack>

        <form>
          <Card padding="sm">
            <CardContent>
              <Stack direction="row" align="center" gap={3} wrap>
                <Stack direction="row" align="center" gap={2} className="min-w-[280px] flex-1">
                  <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
                  <Input name="q" placeholder="Title, handle, or vendor" defaultValue={q ?? ''} />
                </Stack>
                <select
                  name="status"
                  defaultValue={status ?? ''}
                  className="flex h-9 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                  aria-label="Status"
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <Input name="vendor" placeholder="Vendor" defaultValue={vendor ?? ''} />
                <Input name="tag" placeholder="Tag" defaultValue={tag ?? ''} />
                <Stack direction="row" align="center" gap={2}>
                  <input
                    type="checkbox"
                    id="archived"
                    name="archived"
                    value="1"
                    defaultChecked={includeArchived}
                    className="h-4 w-4"
                  />
                  <Text size="sm" as="label" htmlFor="archived">
                    Include archived
                  </Text>
                </Stack>
                <Button type="submit" variant="outline">
                  Apply
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </form>

        {products.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<PackageOpen className="h-5 w-5" />}
              title={total === 0 ? 'No products yet' : 'No products match these filters'}
              description={
                total === 0
                  ? 'Start your catalog with a single product. Variants, options, and fitment can be added after the basics are saved.'
                  : 'Adjust filters or clear the search to broaden the results.'
              }
              action={
                total === 0 ? (
                  <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
                    <Link href="/commerce/products/new">New product</Link>
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Variants</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Stack gap={1}>
                          <EntityRowLink
                            href={`/commerce/products/${p.id}`}
                            entityType="product"
                            entityId={p.id}
                            className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                          >
                            {p.title}
                          </EntityRowLink>
                          <Text size="xs" variant="muted">
                            /{p.handle}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Badge color={STATUS_VARIANT[p.status] ?? 'outline'} className="text-xs">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {p.vendor ?? '—'}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {p.productType ?? '—'}
                        </Text>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Text size="sm">{p.variantCount}</Text>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Text size="sm" variant="muted">
                          {formatPriceRange(p.priceMinCents, p.priceMaxCents)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {new Date(p.updatedAt).toLocaleDateString()}
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
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function parseStatus(v: string | undefined): 'draft' | 'active' | 'archived' | undefined {
  return v === 'draft' || v === 'active' || v === 'archived' ? v : undefined;
}

function formatPriceRange(minCents: number | null, maxCents: number | null): string {
  if (minCents == null) return '—';
  const fmt = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  if (maxCents == null || minCents === maxCents) return fmt(minCents);
  return `${fmt(minCents)}–${fmt(maxCents)}`;
}
