import { Settings2 } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  PageHeader,
  Stack,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { StorefrontSettingsForm } from './_components/storefront-settings-form';

export const dynamic = 'force-dynamic';

interface StorefrontSettings {
  defaultCurrency: string;
  defaultLocale: string;
  defaultWarehouseId: string | null;
  channelsEnabled: string[];
  cartAbandonmentMinutes: number;
  showStockBelow: number;
  hidePricesWhenSignedOut: boolean;
  requireAuthForCheckout: boolean;
}

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  type: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  defaultForChannel: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default async function StorefrontSettingsPage() {
  const [settings, warehouses] = await Promise.all([
    api.get<StorefrontSettings>('/v1/commerce/storefront/settings'),
    api.get<WarehouseRow[]>('/v1/commerce/warehouses'),
  ]);

  const initialForForm = {
    ...settings,
    channelsEnabled: settings.channelsEnabled as (
      | 'storefront'
      | 'b2b_portal'
      | 'admin'
      | 'subscription'
      | 'mcp'
      | 'import'
    )[],
  };

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Settings2 className="h-5 w-5" />}
          title="Storefront settings"
          badge={<Badge color="module">commerce defaults</Badge>}
          description="Tenant-wide commerce defaults. Sitebuilder owns layout — settings here govern currency, channel toggles, abandonment thresholds, and per-checkout guardrails. The storefront and B2B portal read these values at request time."
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Defaults</Heading>
              <CardDescription>
                Currency + locale + default warehouse get picked up by new carts, new orders, and
                checkout sessions. Existing rows keep their frozen values.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <StorefrontSettingsForm
              initial={initialForForm}
              warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code }))}
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
