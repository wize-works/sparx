import { PackageOpen, Settings2 } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { inventoryService, storefrontService } from '@sparx/commerce';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../components/module-stub';

import { StorefrontSettingsForm } from './_components/storefront-settings-form';

export const dynamic = 'force-dynamic';

export default async function StorefrontSettingsPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Storefront settings."
        description="Activate the Commerce module from Billing to configure your storefront."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [settings, warehouses] = await Promise.all([
    storefrontService.getSettings(ctx),
    inventoryService.listWarehouses(ctx),
  ]);

  // The service returns channelsEnabled as a plain string[] (read from a
  // JSON column); the form's Channel union narrows it for the UI.
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
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Settings2 className="h-5 w-5" />
            <Heading level={1}>Storefront settings</Heading>
            <Badge variant="module">commerce defaults</Badge>
          </Stack>
          <Text variant="muted">
            Tenant-wide commerce defaults. Sitebuilder owns layout — settings here govern currency,
            channel toggles, abandonment thresholds, and per-checkout guardrails. The storefront
            and B2B portal read these values at request time.
          </Text>
        </Stack>

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
