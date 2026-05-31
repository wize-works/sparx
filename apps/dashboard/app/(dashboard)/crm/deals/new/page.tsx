import { Container, PageHeader, Stack } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { NewDealForm } from './_components/new-deal-form';

interface PipelineWithStages {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    probability: string | number;
    stageType: 'open' | 'won' | 'lost';
  }[];
}

interface CustomerLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}

// Server entry — loads pipelines + a customer slice so the form's
// dropdowns aren't blocked on a client-side fetch.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewDealPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const [pipelines, customers] = await Promise.all([
    api.get<PipelineWithStages[]>('/v1/crm/pipelines'),
    api
      .getPaged<CustomerLite[]>('/v1/crm/customers?take=200&sort_by=updatedAt')
      .then((r) => r.data),
  ]);

  const initialPipelineId = stringParam(sp.pipelineId) ?? pipelines[0]?.id ?? null;

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New deal"
          description={
            <>
              Track an opportunity through the pipeline. Stage probability feeds the forecast; moves
              emit <code>crm.deal.stage_changed</code> for the email automation engine.
            </>
          }
        />

        <NewDealForm
          pipelines={pipelines.map((p) => ({
            id: p.id,
            name: p.name,
            stages: p.stages.map((s) => ({
              id: s.id,
              name: s.name,
              probability: Number(s.probability),
              stageType: s.stageType,
            })),
          }))}
          customers={customers.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              (c.company ?? c.email ?? c.id.slice(0, 8)),
          }))}
          initialPipelineId={initialPipelineId}
        />
      </Stack>
    </Container>
  );
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
