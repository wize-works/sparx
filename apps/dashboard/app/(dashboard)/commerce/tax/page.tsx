import Link from 'next/link';
import { FileBadge, Globe2, Plus, Receipt } from 'lucide-react';

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
  PageHeader,
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

export default async function TaxPage() {
  const zones = await api.get<TaxZoneRow[]>('/v1/commerce/tax/zones');
  const activeZones = zones.filter((z) => z.isActive);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Receipt className="h-5 w-5" />}
          title="Tax"
          badge={
            <Badge color="module">
              {activeZones.length} active zone{activeZones.length === 1 ? '' : 's'}
            </Badge>
          }
          description="Register a tax zone for every jurisdiction where the merchant has nexus. Manual rates below run when no TaxProvider (Stripe Tax, TaxJar, Avalara) is installed; the provider wins as soon as one is connected from Commerce → Providers. B2B exemption certificates attach per customer or per B2B account."
        />

        <Card>
          <CardHeader>
            <Stack direction="row" align="end" justify="between" wrap gap={2}>
              <Stack gap={1}>
                <Stack direction="row" align="center" gap={2}>
                  <Globe2 className="h-4 w-4" />
                  <Heading level={3}>Nexus zones</Heading>
                </Stack>
                <CardDescription>
                  Country-wide or region-narrowed (US-CA, US-OR…). Click a zone to add rates.
                </CardDescription>
              </Stack>
              <Button asChild>
                <Link href="/commerce/tax/zones/new">
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
                title="No tax zones yet"
                description="Add a zone for every jurisdiction with nexus."
                action={
                  <Button asChild>
                    <Link href="/commerce/tax/zones/new">Create zone</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Nexus</TableHead>
                    <TableHead>Registration #</TableHead>
                    <TableHead>Rates</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((z) => (
                    <TableRow key={z.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/tax/zones/${z.id}`}
                          entityType="tax-zone"
                          entityId={z.id}
                          className="font-medium hover:text-[var(--module-active)]"
                        >
                          {z.country}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        {z.region ?? (
                          <Text size="xs" variant="muted">
                            —
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{z.nexusType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {z.registrationNumber ?? '—'}
                        </Text>
                      </TableCell>
                      <TableCell>{z.rateCount}</TableCell>
                      <TableCell>
                        {z.isActive ? (
                          <Badge color="success">active</Badge>
                        ) : (
                          <Badge color="warning">inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <FileBadge className="h-4 w-4" />
                <Heading level={3}>Exemption certificates</Heading>
              </Stack>
              <CardDescription>
                Customer- or B2B-account-scoped exemptions are attached from the CRM customer detail
                page; the checkout pipeline reads them automatically.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <Text size="sm" variant="muted">
              Open a customer (CRM → Customers) or a B2B account (CRM → B2B accounts) and use the
              Tax exemptions panel to upload certificates.
            </Text>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
