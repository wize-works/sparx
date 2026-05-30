import { Car, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { fitmentService } from '@sparx/commerce';
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
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../components/module-stub';

import { FitmentReferenceEditor } from './_components/fitment-reference-editor';

// Fitment reference data — vehicle makes, models, engines. Drives the
// auto-parts / diesel-service catalog filter (Gillett's reference case).
// Platform-seeded makes/models/engines (tenant_id IS NULL) are visible
// to every tenant and read-only here; tenant-added rows can be edited
// and extended.
//
// Per-product fitment assignment lives on the product detail page's
// Fitment tab — this page is the merchant's "manage the vehicle
// dictionary" surface.

export const dynamic = 'force-dynamic';

export default async function FitmentReferencePage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Fitment data powers vehicle-compatibility filters."
        description="Activate the Commerce module from Billing to manage fitment data."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const makes = await fitmentService.listMakes(ctx);

  const globalCount = makes.filter((m) => m.isGlobal).length;
  const tenantCount = makes.length - globalCount;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Car className="h-5 w-5" />
              <Heading level={1}>Fitment reference</Heading>
              <Badge variant="module">
                {makes.length} make{makes.length === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              The vehicle dictionary your products fit. Platform-seeded rows ({globalCount}) are
              read-only and shared across all tenants; tenant additions ({tenantCount}) are yours
              alone. Add merchant-specific marques (specialty manufacturers, custom builds) without
              touching the global catalog.
            </Text>
          </Stack>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Makes</Heading>
              <CardDescription>
                Click a make to expand its models and engines. Models hang off makes; engines hang
                off models. A product&apos;s fitment rule can target any level of the tree (just the
                make, make + model, or all three).
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {makes.length === 0 ? (
              <EmptyState
                icon={<Car className="h-5 w-5" />}
                title="No vehicle reference data yet"
                description="The platform seeds the major auto and diesel makes on first install. If you don't see them yet, run the fitment seed from the dashboard staff settings."
              />
            ) : (
              <FitmentReferenceEditor makes={makes} />
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
