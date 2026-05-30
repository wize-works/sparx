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

import { NewTaxZoneForm } from './_components/new-tax-zone-form';

export const dynamic = 'force-dynamic';

export default async function NewTaxZonePage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to add tax zones."
        features={[]}
      />
    );
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/tax"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to tax
          </Link>
          <Heading level={1}>Add tax zone</Heading>
          <Text variant="muted">
            One zone per (country, region) pair. Leave region empty for country-wide nexus.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Zone</Heading>
              <CardDescription>
                Nexus type: <code>physical</code> = physical presence, <code>economic</code> = sales
                threshold met, <code>voluntary</code> = registered for compliance even without
                threshold.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <NewTaxZoneForm />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
