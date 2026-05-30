import { notFound } from 'next/navigation';
import { PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { cartService } from '@sparx/commerce';
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

import { ModuleStub } from '../../../../../components/module-stub';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

export async function CartDetailContent({ id }: Props) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to inspect carts."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const cart = await cartService.get(ctx, id);
  if (!cart) notFound();

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Stack direction="row" align="center" gap={2}>
          <Heading level={1} className="font-mono text-2xl">
            {cart.cartId.slice(0, 8)}
          </Heading>
          <Badge variant="outline">{cart.channel}</Badge>
          {cart.abandonedAt && <Badge variant="warning">abandoned</Badge>}
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
