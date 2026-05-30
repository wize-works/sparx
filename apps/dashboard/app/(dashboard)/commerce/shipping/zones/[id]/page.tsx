import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageOpen, Plus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { shippingService } from '@sparx/commerce';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../../../components/module-stub';

import { NewRateForm } from './_components/new-rate-form';
import { RateDeleteButton } from './_components/rate-delete-button';
import { ZoneDeleteButton } from './_components/zone-delete-button';

export const dynamic = 'force-dynamic';

export default async function ShippingZoneDetailPage({
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
        description="Activate the Commerce module from Billing to manage shipping zones."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [zone, profiles, rates] = await Promise.all([
    shippingService.getZone(ctx, id).catch(() => null),
    shippingService.listProfiles(ctx),
    shippingService.listRatesForZone(ctx, id),
  ]);
  if (!zone) notFound();

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return (
    <Container size="xl">
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
