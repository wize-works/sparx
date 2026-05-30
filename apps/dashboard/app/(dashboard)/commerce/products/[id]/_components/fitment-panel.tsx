'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Car, Plus, Trash } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useConfirm,
} from '@sparx/ui';

import {
  deleteFitmentAction,
  listVehicleEnginesAction,
  listVehicleModelsAction,
  setProductFitmentAction,
} from '../../../fitment-actions';

interface FitmentRow {
  id: string;
  makeId: string;
  makeName: string;
  modelId: string | null;
  modelName: string | null;
  engineId: string | null;
  engineName: string | null;
  yearMin: number | null;
  yearMax: number | null;
  notes: string | null;
}

interface MakeOption {
  id: string;
  name: string;
}

interface Props {
  productId: string;
  productTitle: string;
  fitments: FitmentRow[];
  makes: MakeOption[];
}

// Per-product fitment editor. Shows the rules already on the product
// in a sortable table; adds new rules via an inline form below the
// table. Replace-all semantics come from `setProductFitmentAction`;
// individual rule deletes use the per-row `deleteFitmentAction` so a
// merchant can remove a single bad row without resending the rest.

export function FitmentPanel({ productId, productTitle, fitments, makes }: Props) {
  return (
    <Stack gap={4}>
      <Card>
        <CardHeader>
          <Stack direction="row" align="center" gap={2}>
            <Car className="h-4 w-4 text-[var(--module-active)]" />
            <Heading level={3}>Fitment rules</Heading>
            <Badge variant="outline">
              {fitments.length} rule{fitments.length === 1 ? '' : 's'}
            </Badge>
          </Stack>
          <CardDescription>
            Each row is one applicability rule for {productTitle}. Narrower (model+engine+year) wins
            on the storefront — the match runs OR across rows, so a part that fits both the 6.7L
            Power Stroke 2011-2016 and the 7.3L 1999-2003 is two rows here.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {fitments.length === 0 ? (
            <Stack
              gap={2}
              align="center"
              className="border-t border-[var(--color-border-default)] py-10 text-center"
            >
              <Car className="h-5 w-5 text-[var(--color-text-muted)]" />
              <Text size="sm" variant="muted">
                No fitment rules yet. Add one below so storefront vehicle filters can find this
                product.
              </Text>
            </Stack>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Make</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Years</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fitments.map((row) => (
                  <FitmentRowEditor key={row.id} row={row} productId={productId} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack direction="row" align="center" gap={2}>
            <Plus className="h-4 w-4 text-[var(--module-active)]" />
            <Heading level={3}>Add fitment rule</Heading>
          </Stack>
          <CardDescription>
            Pick a make (required). Model + engine + year range are optional — leave blank for
            wildcard match. Add the rule, then refresh to see it in the table above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewFitmentForm productId={productId} fitments={fitments} makes={makes} />
        </CardContent>
      </Card>
    </Stack>
  );
}

function FitmentRowEditor({ row, productId }: { row: FitmentRow; productId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  async function onDelete() {
    const label = `${row.makeName}${row.modelName ? ' / ' + row.modelName : ''}`;
    const ok = await confirm({
      title: `Remove fitment rule for ${label}?`,
      description:
        'This product will no longer appear when shoppers filter by this vehicle. Other fitment rules on this product are unaffected.',
      confirmLabel: 'Remove rule',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFitmentAction(productId, row.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Text size="sm" weight="medium">
          {row.makeName}
        </Text>
      </TableCell>
      <TableCell>
        <Text size="sm">{row.modelName ?? '—'}</Text>
      </TableCell>
      <TableCell>
        <Text size="sm">{row.engineName ?? '—'}</Text>
      </TableCell>
      <TableCell>
        <Text size="sm">{formatYears(row.yearMin, row.yearMax)}</Text>
      </TableCell>
      <TableCell>
        <Text size="xs" variant="muted">
          {row.notes ?? '—'}
        </Text>
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onDelete()}
          disabled={pending}
          leftIcon={<Trash className="h-3.5 w-3.5" />}
        >
          Remove
        </Button>
        {error && (
          <Text size="xs" variant="danger" className="mt-1">
            {error}
          </Text>
        )}
      </TableCell>
    </TableRow>
  );
}

interface NewFormProps {
  productId: string;
  fitments: FitmentRow[];
  makes: MakeOption[];
}

function NewFitmentForm({ productId, fitments, makes }: NewFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [makeId, setMakeId] = React.useState<string>('');
  const [modelOptions, setModelOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [modelId, setModelId] = React.useState<string>('');
  const [engineOptions, setEngineOptions] = React.useState<{ id: string; name: string }[]>([]);

  // Load models when the make changes; clear downstream selections.
  React.useEffect(() => {
    setModelId('');
    setModelOptions([]);
    setEngineOptions([]);
    if (!makeId) return;
    void (async () => {
      const result = await listVehicleModelsAction(makeId);
      if (result.ok) {
        setModelOptions(result.data.map((m) => ({ id: m.id, name: m.name })));
      }
    })();
  }, [makeId]);

  React.useEffect(() => {
    setEngineOptions([]);
    if (!modelId) return;
    void (async () => {
      const result = await listVehicleEnginesAction(modelId);
      if (result.ok) {
        setEngineOptions(result.data.map((e) => ({ id: e.id, name: e.name })));
      }
    })();
  }, [modelId]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const engineId = stringField(form.get('engineId'));
    const yearMinRaw = stringField(form.get('yearMin')).trim();
    const yearMaxRaw = stringField(form.get('yearMax')).trim();
    const notes = stringField(form.get('notes')).trim();

    if (!makeId) {
      setError('Pick a make first.');
      return;
    }

    const yearMin = yearMinRaw ? Number.parseInt(yearMinRaw, 10) : undefined;
    const yearMax = yearMaxRaw ? Number.parseInt(yearMaxRaw, 10) : undefined;
    if (yearMin !== undefined && yearMax !== undefined && yearMin > yearMax) {
      setError('yearMin must be ≤ yearMax.');
      return;
    }

    const newRow = {
      makeId,
      ...(modelId ? { modelId } : {}),
      ...(engineId ? { engineId } : {}),
      ...(Number.isFinite(yearMin) ? { yearMin } : {}),
      ...(Number.isFinite(yearMax) ? { yearMax } : {}),
      ...(notes ? { notes } : {}),
    };

    // Replace-all semantics: build the next list = existing rows + new row.
    const next = [
      ...fitments.map((f) => ({
        makeId: f.makeId,
        ...(f.modelId ? { modelId: f.modelId } : {}),
        ...(f.engineId ? { engineId: f.engineId } : {}),
        ...(f.yearMin !== null ? { yearMin: f.yearMin } : {}),
        ...(f.yearMax !== null ? { yearMax: f.yearMax } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
      })),
      newRow,
    ];

    startTransition(async () => {
      const result = await setProductFitmentAction(productId, next);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setMakeId('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={3}>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="min-w-[180px] flex-1">
            <Label htmlFor="fit-make">Make</Label>
            <select
              id="fit-make"
              value={makeId}
              onChange={(e) => setMakeId(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">— Pick a make —</option>
              {makes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Stack>

          <Stack gap={1} className="min-w-[160px] flex-1">
            <Label htmlFor="fit-model">Model (optional)</Label>
            <select
              id="fit-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={!makeId || modelOptions.length === 0}
              className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">— Any model —</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Stack>

          <Stack gap={1} className="min-w-[160px] flex-1">
            <Label htmlFor="fit-engine">Engine (optional)</Label>
            <select
              id="fit-engine"
              name="engineId"
              disabled={!modelId || engineOptions.length === 0}
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">— Any engine —</option>
              {engineOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Stack>
        </Stack>

        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="w-28">
            <Label htmlFor="fit-year-min">Year from</Label>
            <Input
              id="fit-year-min"
              name="yearMin"
              type="number"
              inputMode="numeric"
              min={1900}
              max={2100}
              placeholder="2011"
            />
          </Stack>
          <Stack gap={1} className="w-28">
            <Label htmlFor="fit-year-max">Year to</Label>
            <Input
              id="fit-year-max"
              name="yearMax"
              type="number"
              inputMode="numeric"
              min={1900}
              max={2100}
              placeholder="2016"
            />
          </Stack>
          <Stack gap={1} className="min-w-[200px] flex-1">
            <Label htmlFor="fit-notes">Notes</Label>
            <Input
              id="fit-notes"
              name="notes"
              placeholder="e.g. requires harness adapter, fleet-only"
            />
          </Stack>
        </Stack>

        {error && (
          <Text size="sm" variant="danger" role="alert" aria-live="polite">
            {error}
          </Text>
        )}

        <Stack direction="row" justify="end">
          <Button
            type="submit"
            variant="module"
            disabled={pending}
            loading={pending}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Add rule
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

function formatYears(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'any';
  if (min !== null && max !== null) return min === max ? `${min}` : `${min}–${max}`;
  if (min !== null) return `${min}+`;
  return `≤${max!}`;
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
