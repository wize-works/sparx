import Link from 'next/link';
import { ArrowLeft, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../../../components/module-stub';

import { NewZoneForm } from './_components/new-zone-form';

export const dynamic = 'force-dynamic';

export default async function NewShippingZonePage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to add shipping zones."
        features={[]}
      />
    );
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/shipping"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to shipping
          </Link>
          <Heading level={1}>New shipping zone</Heading>
          <Text variant="muted">
            Zones are evaluated highest-priority first. A zone with no countries matches any address
            and is typically used as a low-priority catch-all.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Zone</Heading>
              <CardDescription>
                Enter ISO 3166-1 alpha-2 country codes separated by commas (US, CA, GB).
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <NewZoneForm />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
