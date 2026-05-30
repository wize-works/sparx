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

import { NewProfileForm } from './_components/new-profile-form';

export const dynamic = 'force-dynamic';

export default async function NewShippingProfilePage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to add shipping profiles."
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
          <Heading level={1}>New shipping profile</Heading>
          <Text variant="muted">
            Profiles let you route different product categories through different carriers. Most
            merchants start with one general-goods profile and add hazmat or freight profiles only
            when they need them.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Profile</Heading>
              <CardDescription>
                Products attach to profiles via Commerce → Products → Shipping. A product may belong
                to one profile.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <NewProfileForm />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
