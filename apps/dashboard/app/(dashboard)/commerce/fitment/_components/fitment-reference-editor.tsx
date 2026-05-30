'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Car, ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { Badge, Button, Input, Label, Stack, Text } from '@sparx/ui';

import {
  createVehicleEngineAction,
  createVehicleMakeAction,
  createVehicleModelAction,
  listVehicleEnginesAction,
  listVehicleModelsAction,
} from '../../fitment-actions';

interface MakeRow {
  id: string;
  name: string;
  slug: string;
  countryOfOrigin: string | null;
  isGlobal: boolean;
  modelCount: number;
}

interface ModelRow {
  id: string;
  makeId: string;
  name: string;
  slug: string;
  bodyStyle: string | null;
  isGlobal: boolean;
  engineCount: number;
}

interface EngineRow {
  id: string;
  modelId: string;
  name: string;
  displacementCc: number | null;
  cylinders: number | null;
  fuelType: string | null;
  aspiration: string | null;
  isGlobal: boolean;
}

interface Props {
  makes: MakeRow[];
}

// Lazy-loaded fitment tree: expanding a make fetches its models via a
// client call, expanding a model fetches its engines. This avoids
// fanning out a single huge query on the page-load (a fully seeded auto
// dictionary can be 1000+ models + 5000+ engines) while still letting
// merchants browse incrementally.

export function FitmentReferenceEditor({ makes }: Props) {
  return (
    <Stack gap={1}>
      <NewMakeForm />
      <Stack gap={0}>
        {makes.map((make) => (
          <MakeRowComponent key={make.id} make={make} />
        ))}
      </Stack>
    </Stack>
  );
}

function NewMakeForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const slug = stringField(form.get('slug')).trim().toLowerCase();
    const country = stringField(form.get('country')).trim().toUpperCase();

    if (!name || !slug) {
      setError('Name and slug are both required.');
      return;
    }

    startTransition(async () => {
      const result = await createVehicleMakeAction({
        name,
        slug,
        ...(country ? { countryOfOrigin: country } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Stack
      gap={3}
      className="rounded border border-dashed border-[var(--color-border-default)] p-3"
    >
      <Stack direction="row" align="center" justify="between">
        <Text size="sm" weight="medium">
          Add a tenant-specific make
        </Text>
        <Button
          type="button"
          variant={open ? 'ghost' : 'secondary'}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          {open ? 'Cancel' : 'New make'}
        </Button>
      </Stack>
      {open && (
        <form onSubmit={onSubmit} noValidate>
          <Stack direction="row" gap={2} align="end" wrap>
            <Stack gap={1} className="min-w-[180px] flex-1">
              <Label htmlFor="make-name">Name</Label>
              <Input id="make-name" name="name" placeholder="Acme Motorsport" required />
            </Stack>
            <Stack gap={1} className="min-w-[140px] flex-1">
              <Label htmlFor="make-slug">Slug</Label>
              <Input id="make-slug" name="slug" placeholder="acme-motorsport" required />
            </Stack>
            <Stack gap={1} className="w-24">
              <Label htmlFor="make-country">Country</Label>
              <Input id="make-country" name="country" placeholder="US" maxLength={2} />
            </Stack>
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Add
            </Button>
          </Stack>
          {error && (
            <Text size="xs" variant="danger" className="mt-2" role="alert">
              {error}
            </Text>
          )}
        </form>
      )}
    </Stack>
  );
}

function MakeRowComponent({ make }: { make: MakeRow }) {
  const [expanded, setExpanded] = React.useState(false);
  const [models, setModels] = React.useState<ModelRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && models === null) {
      setLoading(true);
      try {
        const result = await listVehicleModelsAction(make.id);
        if (result.ok) {
          setModels(result.data);
        }
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Stack gap={0} className="border-b border-[var(--color-border-default)] last:border-b-0">
      <Stack direction="row" align="center" gap={2} className="py-2">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={expanded ? `Collapse ${make.name}` : `Expand ${make.name}`}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Car className="h-4 w-4 text-[var(--color-text-muted)]" />
        <Text size="sm" weight="medium" className="flex-1">
          {make.name}
        </Text>
        <Text size="xs" variant="muted">
          /{make.slug}
        </Text>
        {make.countryOfOrigin && (
          <Badge variant="outline" className="text-xs">
            {make.countryOfOrigin}
          </Badge>
        )}
        <Badge variant={make.isGlobal ? 'outline' : 'module'} className="text-xs">
          {make.isGlobal ? 'global' : 'tenant'}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {make.modelCount} model{make.modelCount === 1 ? '' : 's'}
        </Badge>
      </Stack>
      {expanded && (
        <Stack gap={1} className="pb-2 pl-8">
          {loading && (
            <Text size="xs" variant="muted">
              Loading models…
            </Text>
          )}
          {!loading && models?.length === 0 && (
            <Text size="xs" variant="muted">
              No models yet.
            </Text>
          )}
          {models?.map((model) => (
            <ModelRowComponent key={model.id} model={model} />
          ))}
          <NewModelForm makeId={make.id} onAdded={() => setModels(null)} />
        </Stack>
      )}
    </Stack>
  );
}

function ModelRowComponent({ model }: { model: ModelRow }) {
  const [expanded, setExpanded] = React.useState(false);
  const [engines, setEngines] = React.useState<EngineRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && engines === null) {
      setLoading(true);
      try {
        const result = await listVehicleEnginesAction(model.id);
        if (result.ok) {
          setEngines(result.data);
        }
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Stack gap={0}>
      <Stack direction="row" align="center" gap={2}>
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={expanded ? `Collapse ${model.name}` : `Expand ${model.name}`}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <Text size="sm" className="flex-1">
          {model.name}
        </Text>
        <Text size="xs" variant="muted">
          /{model.slug}
        </Text>
        {model.bodyStyle && (
          <Badge variant="outline" className="text-xs">
            {model.bodyStyle}
          </Badge>
        )}
        <Badge variant={model.isGlobal ? 'outline' : 'module'} className="text-xs">
          {model.isGlobal ? 'global' : 'tenant'}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {model.engineCount} engine{model.engineCount === 1 ? '' : 's'}
        </Badge>
      </Stack>
      {expanded && (
        <Stack gap={1} className="pb-2 pl-6">
          {loading && (
            <Text size="xs" variant="muted">
              Loading engines…
            </Text>
          )}
          {!loading && engines?.length === 0 && (
            <Text size="xs" variant="muted">
              No engines yet.
            </Text>
          )}
          {engines?.map((engine) => (
            <Stack key={engine.id} direction="row" align="center" gap={2}>
              <Text size="xs" className="flex-1">
                {engine.name}
              </Text>
              {engine.fuelType && (
                <Badge variant="outline" className="text-xs">
                  {engine.fuelType}
                </Badge>
              )}
              {engine.aspiration && engine.aspiration !== 'natural' && (
                <Badge variant="outline" className="text-xs">
                  {engine.aspiration}
                </Badge>
              )}
              {engine.cylinders && (
                <Badge variant="outline" className="text-xs">
                  {engine.cylinders}-cyl
                </Badge>
              )}
              {engine.displacementCc && (
                <Badge variant="outline" className="text-xs">
                  {(engine.displacementCc / 1000).toFixed(1)}L
                </Badge>
              )}
              <Badge variant={engine.isGlobal ? 'outline' : 'module'} className="text-xs">
                {engine.isGlobal ? 'global' : 'tenant'}
              </Badge>
            </Stack>
          ))}
          <NewEngineForm modelId={model.id} onAdded={() => setEngines(null)} />
        </Stack>
      )}
    </Stack>
  );
}

function NewModelForm({ makeId, onAdded }: { makeId: string; onAdded: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const slug = stringField(form.get('slug')).trim().toLowerCase();
    const bodyStyle = stringField(form.get('bodyStyle')).trim();
    if (!name || !slug) {
      setError('Name and slug are required.');
      return;
    }
    startTransition(async () => {
      const result = await createVehicleModelAction({
        makeId,
        name,
        slug,
        ...(bodyStyle ? { bodyStyle } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      onAdded();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack direction="row" gap={2} align="end" wrap>
        <Input name="name" placeholder="Model name" className="min-w-[140px] flex-1" />
        <Input name="slug" placeholder="model-slug" className="min-w-[120px] flex-1" />
        <Input name="bodyStyle" placeholder="body style" className="min-w-[100px] flex-1" />
        <Button type="submit" variant="ghost" size="sm" disabled={pending} loading={pending}>
          Add model
        </Button>
      </Stack>
      {error && (
        <Text size="xs" variant="danger" className="mt-1" role="alert">
          {error}
        </Text>
      )}
    </form>
  );
}

function NewEngineForm({ modelId, onAdded }: { modelId: string; onAdded: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const fuelType = stringField(form.get('fuelType')).trim();
    const cylindersRaw = stringField(form.get('cylinders')).trim();
    const displacementRaw = stringField(form.get('displacementCc')).trim();
    if (!name) {
      setError('Engine name is required.');
      return;
    }
    const cylinders = cylindersRaw ? Number.parseInt(cylindersRaw, 10) : undefined;
    const displacementCc = displacementRaw ? Number.parseInt(displacementRaw, 10) : undefined;
    startTransition(async () => {
      const result = await createVehicleEngineAction({
        modelId,
        name,
        ...(fuelType ? { fuelType } : {}),
        ...(Number.isFinite(cylinders) ? { cylinders } : {}),
        ...(Number.isFinite(displacementCc) ? { displacementCc } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      onAdded();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack direction="row" gap={2} align="end" wrap>
        <Input name="name" placeholder="6.7L Power Stroke" className="min-w-[160px] flex-1" />
        <select
          name="fuelType"
          defaultValue=""
          className="flex h-9 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 text-xs text-[var(--color-text-primary)]"
        >
          <option value="">fuel</option>
          <option value="gasoline">gasoline</option>
          <option value="diesel">diesel</option>
          <option value="hybrid">hybrid</option>
          <option value="electric">electric</option>
          <option value="flex_fuel">flex_fuel</option>
          <option value="cng">cng</option>
          <option value="lpg">lpg</option>
        </select>
        <Input name="cylinders" type="number" placeholder="cyl" className="w-16" min={1} max={16} />
        <Input
          name="displacementCc"
          type="number"
          placeholder="cc"
          className="w-20"
          min={1}
          max={100000}
        />
        <Button type="submit" variant="ghost" size="sm" disabled={pending} loading={pending}>
          Add engine
        </Button>
      </Stack>
      {error && (
        <Text size="xs" variant="danger" className="mt-1" role="alert">
          {error}
        </Text>
      )}
    </form>
  );
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
