import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { customerService, pipelineService } from '@sparx/crm';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';

import { NewDealForm } from './_components/new-deal-form';

// Server entry — loads pipelines + a customer slice so the form's
// dropdowns aren't blocked on a client-side fetch.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewDealPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sp = await searchParams;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const [pipelines, customersResult] = await Promise.all([
    pipelineService.list(ctx),
    customerService.list(ctx, { take: 200, sortBy: 'updatedAt' }),
  ]);

  const initialPipelineId = stringParam(sp.pipelineId) ?? pipelines[0]?.id ?? null;

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/pipelines">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to pipelines
            </Link>
          </Button>
          <Heading level={1}>New deal</Heading>
          <Text variant="muted">
            Track an opportunity through the pipeline. Stage probability feeds the forecast; moves
            emit <code>crm.deal.stage_changed</code> for the email automation engine.
          </Text>
        </Stack>

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
          customers={customersResult.items.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              c.company ||
              c.email ||
              c.id.slice(0, 8),
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
