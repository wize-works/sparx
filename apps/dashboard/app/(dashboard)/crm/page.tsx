import Link from 'next/link';
import { Plus, Users } from 'lucide-react';

import { crmManifest } from '@sparx/crm/manifest';
import {
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Heading,
  PageHeader,
  Stack,
  Stat,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import {
  OverviewChartCard,
  SAMPLE_CRM_GROWTH_12W,
  SAMPLE_CRM_PIPELINE,
} from '../_components/overview-charts';

// CRM overview — the module landing (docs/34 §4 Module Overview archetype).
// KPI + trend snapshot + section cards; the customer list lives one level
// deeper at /crm/customers. Module gate runs in layout.tsx.

export const dynamic = 'force-dynamic';

// Section cards link out to every CRM surface. Driven off the manifest so the
// overview and the panel nav never drift.
const MANAGE = crmManifest.sections.filter((s) => s.href !== crmManifest.routePrefix);

export default async function CrmOverviewPage() {
  const result = await api.getPaged<unknown[]>('/v1/crm/customers?take=1').catch(() => null);
  const totalCustomers = (result?.meta?.total as number | undefined) ?? null;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          className="mb-0"
          icon={<Users className="h-5 w-5" />}
          title="CRM"
          description="Customer intelligence for the whole platform — customers, deals, segments, and activity."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/crm/customers/new">New customer</Link>
            </Button>
          }
        />

        <Grid cols={1} mdCols={2} gap={4}>
          <OverviewChartCard
            title="Customer growth"
            description="Total customers, last 12 weeks"
            data={SAMPLE_CRM_GROWTH_12W}
            series={[{ key: 'customers', label: 'Customers', color: 'module' }]}
            type="area"
            format="number"
          />
          <OverviewChartCard
            title="Pipeline"
            description="Open deals by stage"
            data={SAMPLE_CRM_PIPELINE}
            series={[{ key: 'deals', label: 'Deals', color: 'module' }]}
            type="bar"
            format="number"
          />
        </Grid>

        <Stack gap={4}>
          <Heading level={2}>Manage</Heading>
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {totalCustomers != null && (
              <Stat
                icon={<Users className="h-4 w-4" />}
                label="Total customers"
                value={totalCustomers.toLocaleString()}
                hint="Across all types"
              />
            )}
            {MANAGE.map((section) => {
              const Icon = section.icon;
              return (
                <Card key={section.id} variant="module">
                  <CardContent>
                    <Stack direction="row" gap={3} align="center">
                      <span className="text-[var(--module-active)]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <Link href={section.href} className="font-medium hover:underline">
                        {section.label}
                      </Link>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Grid>
          <Text size="xs" variant="muted">
            Trend cards show sample data until CRM reporting timeseries endpoints land.
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
