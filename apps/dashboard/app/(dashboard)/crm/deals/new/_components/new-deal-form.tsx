'use client';

// New-deal form. Owns its own state because the stage select depends on
// the chosen pipeline. The server action does the real validation — we
// surface its field errors back into the form.

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createDealAction } from '../../../deal-actions';

interface StageOpt {
  id: string;
  name: string;
  probability: number;
  stageType: string;
}
interface PipelineOpt {
  id: string;
  name: string;
  stages: StageOpt[];
}
interface CustomerOpt {
  id: string;
  label: string;
}

interface NewDealFormProps {
  pipelines: PipelineOpt[];
  customers: CustomerOpt[];
  initialPipelineId: string | null;
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export function NewDealForm({ pipelines, customers, initialPipelineId }: NewDealFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pipelineId, setPipelineId] = React.useState<string | null>(initialPipelineId);

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? null;
  const defaultStageId =
    pipeline?.stages.find((s) => s.stageType !== 'lost' && s.stageType !== 'won')?.id ??
    pipeline?.stages[0]?.id ??
    '';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const input = {
      pipelineId,
      stageId: form.get('stageId') as string,
      customerId: nonEmpty(form.get('customerId')),
      title: nonEmpty(form.get('title')) ?? '',
      value: numOrZero(form.get('value')),
      probability: numOrZero(form.get('probability')),
      currency: (nonEmpty(form.get('currency')) ?? 'USD').toUpperCase(),
      expectedCloseDate: nonEmpty(form.get('expectedCloseDate')),
      source: nonEmpty(form.get('source')),
      tags: nonEmpty(form.get('tags'))
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    startTransition(async () => {
      const result = await createDealAction(input);
      if (result.ok) {
        router.push(`/crm/deals/${result.data.id}`);
        router.refresh();
        return;
      }
      if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
        const fe: Record<string, string> = {};
        for (const d of result.error.details) fe[d.field] = d.message;
        setFieldErrors(fe);
      }
      setError(result.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Deal details</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <Stack gap={2}>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Q3 fleet renewal" />
              <FieldError msg={fieldErrors.title} />
            </Stack>

            <Stack direction="row" gap={4}>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="pipelineId">Pipeline</Label>
                <select
                  id="pipelineId"
                  value={pipelineId ?? ''}
                  onChange={(e) => setPipelineId(e.target.value || null)}
                  className={SELECT_CLASS}
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Stack>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="stageId">Stage</Label>
                <select
                  id="stageId"
                  name="stageId"
                  key={pipelineId ?? 'none'}
                  defaultValue={defaultStageId}
                  className={SELECT_CLASS}
                >
                  {pipeline?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.probability}%)
                    </option>
                  ))}
                </select>
                <FieldError msg={fieldErrors.stageId} />
              </Stack>
            </Stack>

            <Stack gap={2}>
              <Label htmlFor="customerId">Customer</Label>
              <select id="customerId" name="customerId" className={SELECT_CLASS} defaultValue="">
                <option value="">(none)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Stack>

            <Stack direction="row" gap={4}>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="value">Value</Label>
                <Input id="value" name="value" type="number" min="0" step="0.01" defaultValue={0} />
                <FieldError msg={fieldErrors.value} />
              </Stack>
              <Stack gap={2} className="w-32">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  name="currency"
                  defaultValue="USD"
                  maxLength={3}
                  className="uppercase"
                />
              </Stack>
              <Stack gap={2} className="w-32">
                <Label htmlFor="probability">Probability</Label>
                <Input
                  id="probability"
                  name="probability"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={0}
                />
              </Stack>
            </Stack>

            <Stack direction="row" gap={4}>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="expectedCloseDate">Expected close</Label>
                <Input id="expectedCloseDate" name="expectedCloseDate" type="date" />
                <FieldError msg={fieldErrors.expectedCloseDate} />
              </Stack>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="source">Source</Label>
                <Input id="source" name="source" placeholder="trade show, referral, …" />
              </Stack>
            </Stack>

            <Stack gap={2}>
              <Label htmlFor="tags">Tags</Label>
              <Textarea
                id="tags"
                name="tags"
                rows={2}
                placeholder="fleet, q3, gillett (comma-separated)"
              />
            </Stack>

            {error && (
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {error}
              </Text>
            )}
          </Stack>
        </CardContent>
        <CardFooter>
          <Button variant="ghost" asChild>
            <Link href="/crm/pipelines">Cancel</Link>
          </Button>
          <Button type="submit" color="module" disabled={pending} loading={pending}>
            Create deal
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numOrZero(value: FormDataEntryValue | null): number {
  const s = typeof value === 'string' ? value.trim() : '';
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <Text size="xs" variant="danger">
      {msg}
    </Text>
  );
}
