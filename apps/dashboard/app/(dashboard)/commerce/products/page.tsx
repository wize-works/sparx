import Link from 'next/link';
import { PackageOpen, Plus } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
  Grid,
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
import { ListToolbar } from '../../_components/list-toolbar';
import { getUserPreferences } from '../../_shell/preferences';

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

// Products index — the pilot for the ListToolbar (docs/34 §7.1): live search +
// quick filters + sort + Table/Cards toggle, all driven through the query
// string. Filters live in the URL so saved views / shared links serialize
// cleanly; the toggle falls back to the user's `defaultListView` preference.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const SORT_OPTIONS = [
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'createdAt', label: 'Newest' },
];

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = parseStatus(stringParam(params.status));
  // vendor / tag / type stay URL-readable for deep links; the toolbar surfaces
  // status + search + sort. Search covers title / handle / vendor.
  const vendor = stringParam(params.vendor);
  const tag = stringParam(params.tag);
  const productType = stringParam(params.type);
  const q = stringParam(params.q);
  const sortBy = stringParam(params.sort_by) ?? 'updatedAt';
  // Selecting the Archived status implies surfacing archived rows at all.
  const includeArchived = status === 'archived' || stringParam(params.archived) === '1';

  const [{ data: products, meta }, prefs] = await Promise.all([
    api.getPaged<ProductListItem[]>(
      `/v1/commerce/products?${new URLSearchParams({
        take: '100',
        sort_by: sortBy,
        ...(includeArchived ? { include_archived: 'true' } : {}),
        ...(status ? { status } : {}),
        ...(vendor ? { vendor } : {}),
        ...(tag ? { tag } : {}),
        ...(productType ? { product_type: productType } : {}),
        ...(q ? { q } : {}),
      }).toString()}`
    ),
    getUserPreferences(),
  ]);
  const total = (meta?.total as number | undefined) ?? products.length;
  // `?view=` overrides; absent → the user's saved default (§7.2).
  const view = (stringParam(params.view) ?? prefs.defaultListView) === 'card' ? 'card' : 'table';

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<PackageOpen className="h-5 w-5" />}
          title="Products"
          badge={
            <Badge color="module">
              {total} product{total === 1 ? '' : 's'}
            </Badge>
          }
          description="Your catalog. Variants, options, fitment, and configurator templates hang off each product. Draft → Active publishes to the storefront; archived rows stay searchable but render as 410."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/commerce/products/new">New product</Link>
            </Button>
          }
        />

        <ListToolbar
          searchPlaceholder="Search title, handle, or vendor…"
          filters={[{ key: 'status', label: 'Statuses', options: STATUS_OPTIONS }]}
          sortOptions={SORT_OPTIONS}
          enableViewToggle
        />

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
        ) : view === 'card' ? (
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {products.map((p) => (
              <Card key={p.id} variant="module" padding="md">
                <Stack gap={3}>
                  <Stack direction="row" align="start" justify="between" gap={2}>
                    <Stack gap={1} className="min-w-0">
                      <EntityRowLink
                        href={`/commerce/products/${p.id}`}
                        entityType="product"
                        entityId={p.id}
                        className="truncate text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                      >
                        {p.title}
                      </EntityRowLink>
                      <Text size="xs" variant="muted">
                        /{p.handle}
                      </Text>
                    </Stack>
                    <Badge color={STATUS_VARIANT[p.status] ?? 'outline'} className="text-xs">
                      {p.status}
                    </Badge>
                  </Stack>
                  <Stack direction="row" align="center" justify="between" gap={2}>
                    <Text size="sm" variant="muted">
                      {p.vendor ?? '—'}
                    </Text>
                    <Text size="sm" className="tabular-nums">
                      {formatPriceRange(p.priceMinCents, p.priceMaxCents)}
                    </Text>
                  </Stack>
                  <Text size="xs" variant="muted">
                    {p.variantCount} variant{p.variantCount === 1 ? '' : 's'} · updated{' '}
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
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
