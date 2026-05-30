import { notFound } from 'next/navigation';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { ProfileDeleteButton } from './_components/profile-delete-button';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface ShippingProfileRow {
  id: string;
  name: string;
  description: string | null;
  allowedCarrierServices: string[];
  hazmatClassesAllowed: string[];
  requiresSignature: boolean;
  requiresFreight: boolean;
  productCount: number;
  variantCount: number;
  collectionCount: number;
  updatedAt: string;
}

export async function ShippingProfileDetailContent({ id }: Props) {
  let profile: ShippingProfileRow;
  try {
    profile = await api.get<ShippingProfileRow>(`/v1/commerce/shipping/profiles/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={2}>
        <Stack gap={1}>
          <Heading level={1}>{profile.name}</Heading>
          {profile.description && <Text variant="muted">{profile.description}</Text>}
        </Stack>
        <ProfileDeleteButton profileId={profile.id} />
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
