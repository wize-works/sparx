import Link from 'next/link';
import { Globe2, Layers, Plus, Truck } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
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

import { api } from '@/lib/api-rest-client';

import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

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

export default async function ShippingPage() {
  const [zones, profiles] = await Promise.all([
    api.get<ShippingZoneRow[]>('/v1/commerce/shipping/zones'),
    api.get<ShippingProfileRow[]>('/v1/commerce/shipping/profiles'),
  ]);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Truck className="h-5 w-5" />
            <Heading level={1}>Shipping</Heading>
            <Badge variant="module">
              {zones.length} zone{zones.length === 1 ? '' : 's'} · {profiles.length} profile
              {profiles.length === 1 ? '' : 's'}
            </Badge>
          </Stack>
          <Text variant="muted">
            Zones map ship-to addresses (by country, region, postal range) to the rates a merchant
            offers there. Profiles group products that share carrier eligibility (standard goods,
            hazmat, freight). Real-time provider rates layer on top once you install a carrier from
            Commerce → Providers; the manual rates here serve as the fallback.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack direction="row" align="end" justify="between" wrap gap={2}>
              <Stack gap={1}>
                <Stack direction="row" align="center" gap={2}>
                  <Globe2 className="h-4 w-4" />
                  <Heading level={3}>Zones</Heading>
                </Stack>
                <CardDescription>
                  At least one zone covering your sell-to countries is required before checkout can
                  quote shipping.
                </CardDescription>
              </Stack>
              <Button asChild>
                <Link href="/commerce/shipping/zones/new">
                  <Plus className="h-4 w-4" />
                  Add zone
                </Link>
              </Button>
            </Stack>
          </CardHeader>
          <CardContent>
            {zones.length === 0 ? (
              <EmptyState
                icon={<Globe2 className="h-5 w-5" />}
                title="No shipping zones yet"
                description="Add at least one zone covering the countries you sell to."
                action={
                  <Button asChild>
                    <Link href="/commerce/shipping/zones/new">Create zone</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Countries</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Rates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((z) => (
                    <TableRow key={z.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/shipping/zones/${z.id}`}
                          entityType="shipping-zone"
                          entityId={z.id}
                          className="font-medium hover:text-[var(--module-active)]"
                        >
                          {z.name}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        {z.targeting.countries.length > 0 ? (
                          <Stack direction="row" gap={1} wrap>
                            {z.targeting.countries.slice(0, 6).map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">
                                {c}
                              </Badge>
                            ))}
                            {z.targeting.countries.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{z.targeting.countries.length - 6}
                              </Badge>
                            )}
                          </Stack>
                        ) : (
                          <Text size="xs" variant="muted">
                            any
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>{z.priority}</TableCell>
                      <TableCell>{z.rateCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Stack direction="row" align="end" justify="between" wrap gap={2}>
              <Stack gap={1}>
                <Stack direction="row" align="center" gap={2}>
                  <Layers className="h-4 w-4" />
                  <Heading level={3}>Profiles</Heading>
                </Stack>
                <CardDescription>
                  Group products that share carrier eligibility. Hazmat-flagged items + freight
                  needs land in their own profile.
                </CardDescription>
              </Stack>
              <Button asChild>
                <Link href="/commerce/shipping/profiles/new">
                  <Plus className="h-4 w-4" />
                  Add profile
                </Link>
              </Button>
            </Stack>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <EmptyState
                icon={<Layers className="h-5 w-5" />}
                title="No shipping profiles yet"
                description="Create one profile per shipping pattern (standard, hazmat, freight)."
                action={
                  <Button asChild>
                    <Link href="/commerce/shipping/profiles/new">Create profile</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Hazmat allowed</TableHead>
                    <TableHead>Freight</TableHead>
                    <TableHead>Signature</TableHead>
                    <TableHead>Products</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/shipping/profiles/${p.id}`}
                          entityType="shipping-profile"
                          entityId={p.id}
                          className="font-medium hover:text-[var(--module-active)]"
                        >
                          {p.name}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" gap={1} wrap>
                          {p.hazmatClassesAllowed.slice(0, 3).map((h) => (
                            <Badge key={h} variant="outline" className="text-xs">
                              {h}
                            </Badge>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {p.requiresFreight ? <Badge variant="warning">freight</Badge> : '—'}
                      </TableCell>
                      <TableCell>
                        {p.requiresSignature ? <Badge variant="outline">required</Badge> : '—'}
                      </TableCell>
                      <TableCell>{p.productCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
