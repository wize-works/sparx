import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';

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

interface CartCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
}

interface CartRow {
  id: string;
  channel: string;
  currency: string;
  customerId: string | null;
  guestToken: string | null;
  subtotalCents: number;
  totalCents: number;
  itemCount: number;
  abandonedAt: string | null;
  recoveredAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  customer: CartCustomer | null;
}

function customerName(c: CartCustomer | null): string | null {
  if (!c) return null;
  const full = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return full !== '' ? full : (c.email ?? null);
}

export default async function CartsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showRecovered = filter === 'recovered';
  const showActive = filter === 'active';
  const filterParam = showRecovered ? 'recovered' : showActive ? 'active' : 'abandoned';

  const carts = await api.get<CartRow[]>(`/v1/commerce/carts?filter=${filterParam}&take=250`);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <ShoppingCart className="h-5 w-5" />
            <Heading level={1}>Carts</Heading>
            <Badge color="module">{carts.length} shown</Badge>
          </Stack>
          <Text variant="muted">
            Read-only diagnostic view. Abandoned carts are flagged by the cart-abandonment worker
            after 2 hours of inactivity; recovered carts converted into orders. Click an ID to
            inspect the line items and pricing trace.
          </Text>
        </Stack>

        <Stack direction="row" gap={2}>
          <FilterLink current={filter} value={undefined} label="Abandoned" />
          <FilterLink current={filter} value="active" label="Active" />
          <FilterLink current={filter} value="recovered" label="Recovered" />
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>
                {showRecovered ? 'Recovered' : showActive ? 'Active' : 'Abandoned'} carts
              </Heading>
              <CardDescription>
                Storefront writes through cartService; this dashboard is read-only.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {carts.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="h-5 w-5" />}
                title="No carts"
                description="Carts surface here when the storefront / B2B portal starts writing."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Lifecycle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carts.map((c) => {
                    const displayName = customerName(c.customer);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <EntityRowLink
                            href={`/commerce/carts/${c.id}`}
                            entityType="cart"
                            entityId={c.id}
                            className="font-mono text-xs hover:text-[var(--module-active)]"
                          >
                            {c.id.slice(0, 8)}
                          </EntityRowLink>
                        </TableCell>
                        <TableCell>
                          {c.customer?.email ? (
                            <Stack gap={0}>
                              <Text size="sm">{displayName ?? c.customer.email}</Text>
                              {displayName && displayName !== c.customer.email && (
                                <Text size="xs" variant="muted">
                                  {c.customer.email}
                                </Text>
                              )}
                            </Stack>
                          ) : c.guestToken ? (
                            <Text size="xs" variant="muted">
                              guest
                            </Text>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{c.channel}</Badge>
                        </TableCell>
                        <TableCell>{c.itemCount}</TableCell>
                        <TableCell>
                          ${(c.totalCents / 100).toFixed(2)} {c.currency}
                        </TableCell>
                        <TableCell>{new Date(c.updatedAt).toLocaleString()}</TableCell>
                        <TableCell>
                          {c.recoveredAt ? (
                            <Badge color="success">recovered</Badge>
                          ) : c.abandonedAt ? (
                            <Badge color="warning">abandoned</Badge>
                          ) : (
                            <Badge variant="outline">active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const isActive = current === value || (current === undefined && value === undefined);
  const href = value ? `/commerce/carts?filter=${value}` : '/commerce/carts';
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
