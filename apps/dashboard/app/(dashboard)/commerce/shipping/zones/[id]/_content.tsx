import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  EmptyState,
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

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { NewRateForm } from './_components/new-rate-form';
import { RateDeleteButton } from './_components/rate-delete-button';
import { ZoneDeleteButton } from './_components/zone-delete-button';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface ZoneTargeting {
  countries: string[];
  regions: string[];
  postalCodeRanges: { country: string; from: string; to: string }[];
}

interface ShippingZoneRow {
  id: string;
  name: string;
  priority: number;
  targeting: ZoneTargeting;
  rateCount: number;
  updatedAt: string;
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

interface ShippingRateRow {
  id: string;
  zoneId: string;
  profileId: string;
  name: string;
  type: string;
  amountCents: number | null;
  freeAboveCents: number | null;
  bands: { min: number; max?: number; amountCents: number }[] | null;
  currency: string;
  carrier: string | null;
  estimatedDeliveryDays: number | null;
}

export async function ShippingZoneDetailContent({ id }: Props) {
  let zone: ShippingZoneRow;
  try {
    zone = await api.get<ShippingZoneRow>(`/v1/commerce/shipping/zones/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }
  const [profiles, rates] = await Promise.all([
    api.get<ShippingProfileRow[]>('/v1/commerce/shipping/profiles'),
    api.get<ShippingRateRow[]>(`/v1/commerce/shipping/zones/${id}/rates`),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={2}>
        <Stack gap={1}>
          <Heading level={1}>{zone.name}</Heading>
          <Stack direction="row" gap={2} align="center">
            <Badge variant="outline">priority {zone.priority}</Badge>
            <Text size="sm" variant="muted">
              {zone.targeting.countries.length === 0
                ? 'any country'
                : `${zone.targeting.countries.length} countries`}
            </Text>
          </Stack>
        </Stack>
        <ZoneDeleteButton zoneId={zone.id} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Targeting</Heading>
            <CardDescription>
              The address matcher checks countries first, then regions, then postal-code ranges.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={3}>
            <Field label="Countries">
              {zone.targeting.countries.length > 0 ? (
                <Stack direction="row" gap={1} wrap>
                  {zone.targeting.countries.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" variant="muted">
                  any
                </Text>
              )}
            </Field>
            <Field label="Regions">
              {zone.targeting.regions.length > 0 ? (
                <Stack direction="row" gap={1} wrap>
                  {zone.targeting.regions.map((r) => (
                    <Badge key={r} variant="outline">
                      {r}
                    </Badge>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" variant="muted">
                  none
                </Text>
              )}
            </Field>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Stack direction="row" align="center" gap={2}>
              <Plus className="h-4 w-4" />
              <Heading level={3}>Manual rates</Heading>
            </Stack>
            <CardDescription>
              Storefront uses these when no carrier provider is installed, or as a fallback if
              provider rates time out.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            {rates.length === 0 ? (
              <EmptyState
                icon={<Plus className="h-5 w-5" />}
                title="No rates yet"
                description="Add a flat, by-weight, by-price, by-item-count, or free-above-threshold rate."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <Text size="xs" variant="muted">
                          {profileById.get(r.profileId)?.name ?? r.profileId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.amountCents != null
                          ? `${(r.amountCents / 100).toFixed(2)} ${r.currency}`
                          : r.bands && r.bands.length > 0
                            ? `${r.bands.length} bands`
                            : '—'}
                      </TableCell>
                      <TableCell>{r.carrier ?? '—'}</TableCell>
                      <TableCell>
                        <RateDeleteButton rateId={r.id} zoneId={zone.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Heading level={4}>Add a rate</Heading>
            <NewRateForm zoneId={zone.id} profiles={profiles} />
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
