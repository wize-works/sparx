import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageOpen, Plus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { taxService } from '@sparx/commerce';
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

import { NewTaxRateForm } from './_components/new-tax-rate-form';
import { TaxRateDeleteButton } from './_components/tax-rate-delete-button';
import { TaxZoneDeleteButton } from './_components/tax-zone-delete-button';

export const dynamic = 'force-dynamic';

export default async function TaxZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to manage tax zones."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [zone, rates] = await Promise.all([
    taxService.getZone(ctx, id).catch(() => null),
    taxService.listRatesForZone(ctx, id),
  ]);
  if (!zone) notFound();

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/tax"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to tax
          </Link>
          <Stack direction="row" align="end" justify="between" wrap gap={2}>
            <Stack gap={1}>
              <Heading level={1}>
                {zone.country}
                {zone.region ? ` — ${zone.region}` : ''}
              </Heading>
              <Stack direction="row" gap={2} align="center">
                <Badge variant="outline">{zone.nexusType}</Badge>
                {zone.registrationNumber && (
                  <Text size="xs" className="font-mono" variant="muted">
                    {zone.registrationNumber}
                  </Text>
                )}
              </Stack>
            </Stack>
            <TaxZoneDeleteButton zoneId={zone.id} />
          </Stack>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <Plus className="h-4 w-4" />
                <Heading level={3}>Manual rates</Heading>
              </Stack>
              <CardDescription>
                Used when no TaxProvider is installed. Each rate&apos;s basis points (e.g. 825 =
                8.25%) stack additively per matching line.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              {rates.length === 0 ? (
                <EmptyState
                  icon={<Plus className="h-5 w-5" />}
                  title="No rates yet"
                  description="Add the sales-tax / VAT rate for this jurisdiction."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Applies to shipping</TableHead>
                      <TableHead>Product class</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>
                          <Text className="font-mono">{(r.rateBasisPoints / 100).toFixed(2)}%</Text>
                        </TableCell>
                        <TableCell>{r.appliesToShipping ? 'yes' : 'no'}</TableCell>
                        <TableCell>
                          {r.productTaxClass ?? (
                            <Text size="xs" variant="muted">
                              all
                            </Text>
                          )}
                        </TableCell>
                        <TableCell>
                          <TaxRateDeleteButton rateId={r.id} zoneId={zone.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Heading level={4}>Add a rate</Heading>
              <NewTaxRateForm zoneId={zone.id} />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
