import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { shippingService } from '@sparx/commerce';
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

import { ModuleStub } from '../../../../../../components/module-stub';

import { ProfileDeleteButton } from './_components/profile-delete-button';

export const dynamic = 'force-dynamic';

export default async function ShippingProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to manage shipping profiles."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const profile = await shippingService.getProfile(ctx, id).catch(() => null);
  if (!profile) notFound();

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/shipping"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to shipping
          </Link>
          <Stack direction="row" align="end" justify="between" wrap gap={2}>
            <Stack gap={1}>
              <Heading level={1}>{profile.name}</Heading>
              {profile.description && <Text variant="muted">{profile.description}</Text>}
            </Stack>
            <ProfileDeleteButton profileId={profile.id} />
          </Stack>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Carrier eligibility</Heading>
              <CardDescription>
                What this profile allows. Edit via direct API for now; visual editor lands in Phase
                5.x.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <Stack gap={3}>
              <Field label="Hazmat classes allowed">
                <Stack direction="row" gap={1} wrap>
                  {profile.hazmatClassesAllowed.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </Stack>
              </Field>
              <Field label="Allowed carrier services">
                {profile.allowedCarrierServices.length > 0 ? (
                  <Stack direction="row" gap={1} wrap>
                    {profile.allowedCarrierServices.map((s) => (
                      <Badge key={s} variant="outline" className="font-mono text-xs">
                        {s}
                      </Badge>
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm" variant="muted">
                    any
                  </Text>
                )}
              </Field>
              <Stack direction="row" gap={4}>
                {profile.requiresSignature && <Badge variant="outline">Signature required</Badge>}
                {profile.requiresFreight && <Badge variant="warning">Freight only</Badge>}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Attached</Heading>
              <CardDescription>
                Products / variants / collections currently routed through this profile.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <Stack direction="row" gap={6}>
              <Counter label="Products" value={profile.productCount} />
              <Counter label="Variants" value={profile.variantCount} />
              <Counter label="Collections" value={profile.collectionCount} />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={1}>
      <Text size="xs" variant="muted">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <Stack gap={1}>
      <Text size="xs" variant="muted">
        {label}
      </Text>
      <Heading level={3}>{value}</Heading>
    </Stack>
  );
}
