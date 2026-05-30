'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Switch, Text } from '@sparx/ui';

import { updateStorefrontSettingsAction } from '../../storefront-actions';

type Channel = 'storefront' | 'b2b_portal' | 'admin' | 'subscription' | 'mcp' | 'import';

interface Settings {
  defaultCurrency: string;
  defaultLocale: string;
  defaultWarehouseId: string | null;
  channelsEnabled: Channel[];
  cartAbandonmentMinutes: number;
  showStockBelow: number;
  hidePricesWhenSignedOut: boolean;
  requireAuthForCheckout: boolean;
}

interface WarehouseOption {
  id: string;
  name: string;
  code: string;
}

const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'storefront', label: 'Retail storefront' },
  { id: 'b2b_portal', label: 'B2B portal' },
  { id: 'admin', label: 'Admin / staff' },
  { id: 'subscription', label: 'Subscriptions' },
  { id: 'mcp', label: 'MCP / agents' },
  { id: 'import', label: 'Bulk import' },
];

export function StorefrontSettingsForm({
  initial,
  warehouses,
}: {
  initial: Settings;
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function toggleChannel(id: Channel) {
    setForm((prev) => {
      const has = prev.channelsEnabled.includes(id);
      return {
        ...prev,
        channelsEnabled: has
          ? prev.channelsEnabled.filter((c) => c !== id)
          : [...prev.channelsEnabled, id],
      };
    });
    setSaved(false);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateStorefrontSettingsAction({
        ...form,
        defaultWarehouseId: form.defaultWarehouseId ?? undefined,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Stack gap={5}>
      <Stack direction="row" gap={4} wrap>
        <Stack gap={1} className="min-w-[12rem] flex-1">
          <Label htmlFor="currency">Default currency</Label>
          <Input
            id="currency"
            value={form.defaultCurrency}
            onChange={(e) => set('defaultCurrency', e.target.value.toUpperCase())}
            maxLength={3}
          />
          <Text size="xs" variant="muted">
            ISO 4217 (USD, EUR, GBP).
          </Text>
        </Stack>
        <Stack gap={1} className="min-w-[12rem] flex-1">
          <Label htmlFor="locale">Default locale</Label>
          <Input
            id="locale"
            value={form.defaultLocale}
            onChange={(e) => set('defaultLocale', e.target.value)}
            maxLength={10}
          />
          <Text size="xs" variant="muted">
            BCP-47 (en-US, en-GB, fr-FR).
          </Text>
        </Stack>
      </Stack>

      <Stack gap={1}>
        <Label htmlFor="warehouse">Default warehouse</Label>
        <select
          id="warehouse"
          value={form.defaultWarehouseId ?? ''}
          onChange={(e) => set('defaultWarehouseId', e.target.value || null)}
          className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-default)] px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} · {w.name}
            </option>
          ))}
        </select>
        <Text size="xs" variant="muted">
          New carts default to this warehouse. Override per-order at checkout.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Label>Channels enabled</Label>
        <Stack direction="row" gap={3} wrap>
          {CHANNELS.map((c) => {
            const on = form.channelsEnabled.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChannel(c.id)}
                className={
                  on
                    ? 'rounded border border-[var(--module-active)] bg-[var(--module-active-tint)] px-3 py-1.5 text-xs text-[var(--module-active-text)]'
                    : 'rounded border border-[var(--color-border-default)] px-3 py-1.5 text-xs hover:bg-[var(--color-bg-subtle)]'
                }
              >
                {c.label}
              </button>
            );
          })}
        </Stack>
        <Text size="xs" variant="muted">
          Disabled channels return 404 for their routes. The retail storefront and B2B portal each
          have their own app; toggling here gates feature visibility tenant-wide.
        </Text>
      </Stack>

      <Stack direction="row" gap={4} wrap>
        <Stack gap={1} className="min-w-[14rem] flex-1">
          <Label htmlFor="abandonment">Cart abandonment threshold (minutes)</Label>
          <Input
            id="abandonment"
            type="number"
            min={15}
            max={60 * 24 * 30}
            value={form.cartAbandonmentMinutes}
            onChange={(e) => set('cartAbandonmentMinutes', Number(e.target.value))}
          />
        </Stack>
        <Stack gap={1} className="min-w-[14rem] flex-1">
          <Label htmlFor="showstock">Show stock when below</Label>
          <Input
            id="showstock"
            type="number"
            min={0}
            value={form.showStockBelow}
            onChange={(e) => set('showStockBelow', Number(e.target.value))}
          />
          <Text size="xs" variant="muted">
            Storefront PDP renders &ldquo;Only N left&rdquo; when on-hand is below this number.
          </Text>
        </Stack>
      </Stack>

      <Stack gap={3}>
        <Stack direction="row" gap={3} align="center" justify="between">
          <Stack gap={0}>
            <Label htmlFor="hideprices">Hide prices when signed out</Label>
            <Text size="xs" variant="muted">
              Useful for trade pricing; storefront prompts sign-in to reveal prices.
            </Text>
          </Stack>
          <Switch
            id="hideprices"
            checked={form.hidePricesWhenSignedOut}
            onCheckedChange={(v) => set('hidePricesWhenSignedOut', v)}
          />
        </Stack>
        <Stack direction="row" gap={3} align="center" justify="between">
          <Stack gap={0}>
            <Label htmlFor="requireauth">Require auth for checkout</Label>
            <Text size="xs" variant="muted">
              Guest carts work, but checkout forces sign-in / sign-up before placing the order.
            </Text>
          </Stack>
          <Switch
            id="requireauth"
            checked={form.requireAuthForCheckout}
            onCheckedChange={(v) => set('requireAuthForCheckout', v)}
          />
        </Stack>
      </Stack>

      <Stack direction="row" gap={2} justify="between" align="center">
        <Stack gap={0}>
          {error && (
            <Text size="xs" className="text-[var(--color-danger)]">
              {error}
            </Text>
          )}
          {saved && !error && (
            <Text size="xs" className="text-[var(--color-success-text)]">
              Saved
            </Text>
          )}
        </Stack>
        <Button variant="primary" disabled={pending} onClick={onSave}>
          Save settings
        </Button>
      </Stack>
    </Stack>
  );
}
