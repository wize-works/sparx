import { notFound } from 'next/navigation';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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

import { api, type ApiRestError } from '@/lib/api-rest-client';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface CartItem {
  cartItemId: string;
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

interface CartTotals {
  subtotalCents: number;
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  giftCardAppliedCents: number;
  storeCreditAppliedCents: number;
  totalCents: number;
}

interface CartSnapshot {
  cartId: string;
  customerId: string | null;
  channel: string;
  currency: string;
  items: CartItem[];
  appliedDiscountCodes: string[];
  appliedGiftCardCodes: string[];
  storeCreditAppliedCents: number;
  totals: CartTotals;
  expiresAt: string;
  abandonedAt: string | null;
}

export async function CartDetailContent({ id }: Props) {
  let cart: CartSnapshot | null;
  try {
    cart = await api.get<CartSnapshot | null>(`/v1/commerce/carts/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }
  if (!cart) notFound();

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Stack direction="row" align="center" gap={2}>
          <Heading level={1} className="font-mono text-2xl">
            {cart.cartId.slice(0, 8)}
          </Heading>
          <Badge variant="outline">{cart.channel}</Badge>
          {cart.abandonedAt && <Badge color="warning">abandoned</Badge>}
        </Stack>
        <Text variant="muted">
          {cart.customerId ? (
            <>
              Customer{' '}
              <Text className="font-mono" size="sm">
                {cart.customerId.slice(0, 8)}
              </Text>
            </>
          ) : (
            'Guest cart'
          )}
          {' · '}
          currency {cart.currency}
        </Text>
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Items</Heading>
            <CardDescription>
              Frozen at the moment of last storefront write; reopening recomputes totals.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cart.items.map((it) => (
                <TableRow key={it.cartItemId}>
                  <TableCell>
                    <Text size="xs" className="font-mono">
                      {it.variantId.slice(0, 8)}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size="xs" className="font-mono">
                      {it.sku}
                    </Text>
                  </TableCell>
                  <TableCell>{it.name}</TableCell>
                  <TableCell>{it.quantity}</TableCell>
                  <TableCell>${(it.unitPriceCents / 100).toFixed(2)}</TableCell>
                  <TableCell>${(it.subtotalCents / 100).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Totals</Heading>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={2}>
            <Row label="Subtotal" value={fmt(cart.totals.subtotalCents, cart.currency)} />
            <Row
              label="Discounts"
              value={`-${fmt(cart.totals.discountTotalCents, cart.currency)}`}
            />
            <Row label="Shipping" value={fmt(cart.totals.shippingTotalCents, cart.currency)} />
            <Row label="Tax" value={fmt(cart.totals.taxTotalCents, cart.currency)} />
            <Row
              label="Gift card applied"
              value={`-${fmt(cart.totals.giftCardAppliedCents, cart.currency)}`}
            />
            <Row
              label="Store credit applied"
              value={`-${fmt(cart.totals.storeCreditAppliedCents, cart.currency)}`}
            />
            <Row label="Total" value={fmt(cart.totals.totalCents, cart.currency)} bold />
            {cart.appliedDiscountCodes.length > 0 && (
              <Stack direction="row" gap={1} wrap className="pt-1">
                {cart.appliedDiscountCodes.map((code) => (
                  <Badge key={code} variant="outline" className="font-mono">
                    {code}
                  </Badge>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function fmt(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Stack direction="row" gap={4}>
      <Text size="sm" className="w-40" variant="muted">
        {label}
      </Text>
      <Text size="sm" className={bold ? 'font-semibold' : ''}>
        {value}
      </Text>
    </Stack>
  );
}
