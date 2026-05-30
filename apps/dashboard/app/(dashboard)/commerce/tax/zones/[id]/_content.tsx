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

import { NewTaxRateForm } from './_components/new-tax-rate-form';
import { TaxRateDeleteButton } from './_components/tax-rate-delete-button';
import { TaxZoneDeleteButton } from './_components/tax-zone-delete-button';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface TaxZoneRow {
  id: string;
  country: string;
  region: string | null;
  nexusType: string;
  registrationNumber: string | null;
  registeredAt: string | null;
  isActive: boolean;
  rateCount: number;
}

interface TaxRateRow {
  id: string;
  zoneId: string;
  name: string;
  rateBasisPoints: number;
  appliesToShipping: boolean;
  productTaxClass: string | null;
}

export async function TaxZoneDetailContent({ id }: Props) {
  let zone: TaxZoneRow;
  try {
    zone = await api.get<TaxZoneRow>(`/v1/commerce/tax/zones/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }
  const rates = await api.get<TaxRateRow[]>(`/v1/commerce/tax/zones/${id}/rates`);

  return (
    <Stack gap={6}>
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
  );
}
