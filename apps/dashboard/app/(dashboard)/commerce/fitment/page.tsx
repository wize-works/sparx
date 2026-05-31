import { Boxes } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  PageHeader,
  Stack,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { FitmentReferenceEditor } from './_components/fitment-reference-editor';

interface FitmentDomainRow {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  labels: { l1: string; l2?: string; l3?: string; range?: string };
  rangeUnit: string | null;
  isGlobal: boolean;
  categoryCount: number;
}

// Fitment reference data — the "what your products are compatible with"
// dictionary. Generalized across domains: Sparx seeds the Vehicle domain
// (Make → Model → Engine + Year) globally; tenants can register their
// own (Pet: Species → Breed; Device: Brand → Model; Apparel: Size; ...)
// or extend the Vehicle domain with custom marques.
//
// Per-product fitment assignment lives on the product detail page's
// Fitment tab — this page is the merchant's "manage the compatibility
// dictionary" surface.

export const dynamic = 'force-dynamic';

export default async function FitmentReferencePage() {
  const domains = await api.get<FitmentDomainRow[]>('/v1/commerce/fitment/domains');

  const globalCount = domains.filter((d) => d.isGlobal).length;
  const tenantCount = domains.length - globalCount;

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Boxes className="h-5 w-5" />}
          title="Fitment reference"
          badge={
            <Badge color="module">
              {domains.length} domain{domains.length === 1 ? '' : 's'}
            </Badge>
          }
          description={
            <>
              The compatibility dictionary your products fit. Platform-seeded domains ({globalCount}
              ) are read-only and shared across all tenants; tenant-defined domains ({tenantCount})
              are yours alone. A vehicle store uses Make/Model/Engine + Year; a pet store uses
              Species/Breed + Weight; a phone-case shop uses Brand/Model. Each domain owns its own
              vocabulary.
            </>
          }
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Domains</Heading>
              <CardDescription>
                Expand a domain to manage its categories, items, and variants. A product&apos;s
                fitment rule can target any depth — just the category (fits any Ford), category +
                item (fits an F-250), or all three (fits an F-250 with a 6.7L Power Stroke).
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <EmptyState
                icon={<Boxes className="h-5 w-5" />}
                title="No fitment domains yet"
                description="The platform seeds the Vehicle domain on first install. If you don't see it yet, run the fitment seed from the dashboard staff settings."
              />
            ) : (
              <FitmentReferenceEditor domains={domains} />
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
