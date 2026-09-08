'use client';

// ONE RECIPE — what a finished thing is made of, and how many you could make.
//
// ── Per BATCH, and the screen never lets you forget it ───────────────────
//
// The single most ambiguous number in this feature is "quantity" on a component.
// Per finished unit, or per run? Every label here says per run, because a run of
// 100 needing three litres of glue records 3 — per-unit would be 0.03, and stock
// is counted in whole things. Kitchens and workshops write recipes per batch
// anyway; this matches how the work is actually described.
//
// ── The number people open this for ──────────────────────────────────────
//
// "How many can I make right now" sits at the top, with the component that runs
// out first named. That second half is what turns the answer into a purchase
// order — "14" leaves someone to work out why across a recipe of thirty parts.
// It is a server figure, measured against what is genuinely free to use, so
// parts already promised to a customer order are not counted twice.
//
// ── Explicit save, like every other editor here ──────────────────────────
//
// One Save button, last write wins, and the leave-guard registers so closing
// with unsaved changes asks first. Components are replaced as a set on save,
// because a recipe is a set: patching one ingredient at a time leaves moments
// where it does not add up.

import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Table } from '../../components/table';
import { useConfirm } from '../../lib/confirm';
import {
  faFloppyDisk,
  faHammer,
  faPlus,
  faPotFood,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, useStockLocations } from './data';
import { buyingErrorMessage, isNotFound, useVariantLookup } from './suppliers-data';
import {
  bomState,
  buildableTone,
  useBom,
  useBuildable,
  useDeleteBom,
  useSaveBom,
  useSetBomStatus,
  type BomComponentInput,
  type BomStatus,
} from './assembly-data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/** A component being edited. Strings, because a half-typed "1." is a legitimate
 *  intermediate state and parsing every keystroke eats the decimal point. */
interface ComponentDraft {
  variantId: string;
  variantSku: string;
  productTitle: string;
  quantityPer: string;
  scrapPercent: string;
}

interface Draft {
  outputVariantId: string;
  outputSku: string;
  name: string;
  outputQuantity: string;
  laborCost: string;
  notes: string;
  components: ComponentDraft[];
}

function emptyDraft(): Draft {
  return {
    outputVariantId: '',
    outputSku: '',
    name: '',
    outputQuantity: '1',
    laborCost: '',
    notes: '',
    components: [],
  };
}

function parseInt10(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseCents(raw: string): number {
  const value = Number(raw.trim());
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : 0;
}

export function BomDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const toast = useToast();
  const confirm = useConfirm();
  const bom = useBom(id);
  const saveBom = useSaveBom(id);
  const setStatus = useSetBomStatus(id);
  const removeBom = useDeleteBom();
  const lookup = useVariantLookup();
  const locations = useStockLocations();

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyDraft()));
  const [loaded, setLoaded] = useState(false);
  const [skuEntry, setSkuEntry] = useState('');
  const [outputSkuEntry, setOutputSkuEntry] = useState('');
  const [locationId, setLocationId] = useState('');

  const activeLocations = useMemo(
    () => (locations.data?.items ?? []).filter((l) => l.isActive),
    [locations.data]
  );
  useEffect(() => {
    if (locationId === '' && activeLocations.length > 0) setLocationId(activeLocations[0]!.id);
  }, [activeLocations, locationId]);

  const buildable = useBuildable(isNew ? '' : id, locationId);

  useEffect(() => {
    if (isNew) {
      ctx.setTitle('New recipe');
      return;
    }
    if (bom.data) ctx.setTitle(bom.data.name);
  }, [ctx, isNew, bom.data]);

  // Seed once. Re-seeding on every refetch would throw away edits in progress.
  useEffect(() => {
    if (isNew || loaded || !bom.data) return;
    const next: Draft = {
      outputVariantId: bom.data.outputVariantId,
      outputSku: bom.data.outputSku ?? '',
      name: bom.data.name,
      outputQuantity: String(bom.data.outputQuantity),
      laborCost: bom.data.laborCostCents ? (bom.data.laborCostCents / 100).toFixed(2) : '',
      notes: bom.data.notes ?? '',
      components: bom.data.components.map((c) => ({
        variantId: c.variantId,
        variantSku: c.variantSku ?? '',
        productTitle: c.productTitle ?? '',
        quantityPer: String(c.quantityPer),
        scrapPercent: c.scrapPercent ? String(c.scrapPercent) : '',
      })),
    };
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setLoaded(true);
  }, [isNew, loaded, bom.data]);

  const dirty = JSON.stringify(draft) !== baseline;
  useDirtySource(dirty, 'You have unsaved changes to this recipe. Close anyway?');

  const status: BomStatus = bom.data?.status ?? 'draft';
  const editable = isNew || status !== 'archived';
  const canSave =
    editable &&
    draft.outputVariantId !== '' &&
    draft.name.trim() !== '' &&
    draft.components.length > 0;

  const addComponent = () => {
    const sku = skuEntry.trim();
    if (sku === '') return;
    lookup.mutate(sku, {
      onSuccess: (found) => {
        if (found.variantId === draft.outputVariantId) {
          toast.add({
            title: 'That is the thing you are making',
            description: 'A recipe cannot list its own output as one of its ingredients.',
            type: 'error',
          });
          return;
        }
        if (draft.components.some((c) => c.variantId === found.variantId)) {
          toast.add({
            title: 'Already on the recipe',
            description: 'Change the quantity on the existing line instead of adding it twice.',
            type: 'error',
          });
          return;
        }
        setDraft((d) => ({
          ...d,
          components: [
            ...d.components,
            {
              variantId: found.variantId,
              variantSku: found.sku,
              productTitle: found.productTitle ?? '',
              quantityPer: '1',
              scrapPercent: '',
            },
          ],
        }));
        setSkuEntry('');
      },
      onError: () => {
        toast.add({
          title: 'No item with that code',
          description: `Nothing in your catalog is coded "${sku}". Check the code and try again.`,
          type: 'error',
        });
      },
    });
  };

  const setOutput = () => {
    const sku = outputSkuEntry.trim();
    if (sku === '') return;
    lookup.mutate(sku, {
      onSuccess: (found) => {
        if (draft.components.some((c) => c.variantId === found.variantId)) {
          toast.add({
            title: 'That is already an ingredient',
            description: 'A recipe cannot make the same thing it is made of.',
            type: 'error',
          });
          return;
        }
        setDraft((d) => ({
          ...d,
          outputVariantId: found.variantId,
          outputSku: found.sku,
          name: d.name || `${found.productTitle ?? found.sku} recipe`,
        }));
        setOutputSkuEntry('');
      },
      onError: () => {
        toast.add({
          title: 'No item with that code',
          description: `Nothing in your catalog is coded "${sku}".`,
          type: 'error',
        });
      },
    });
  };

  const save = () => {
    if (!canSave) return;
    const components: BomComponentInput[] = draft.components.map((c) => ({
      variantId: c.variantId,
      quantityPer: parseInt10(c.quantityPer, 1),
      ...(c.scrapPercent.trim() !== '' ? { scrapPercent: Number(c.scrapPercent) } : {}),
    }));

    saveBom.mutate(
      {
        outputVariantId: draft.outputVariantId,
        name: draft.name.trim(),
        outputQuantity: parseInt10(draft.outputQuantity, 1),
        laborCostCents: parseCents(draft.laborCost),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        components,
      },
      {
        onSuccess: (saved) => {
          setBaseline(JSON.stringify(draft));
          if (isNew) {
            ctx.open('inventory.boms.detail', { id: saved.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({
                title: `${saved.name} saved`,
                description:
                  'Mark it as in use when you are ready to build to it — a draft cannot be built from, so everyone builds to the same recipe.',
                type: 'success',
              });
            });
            return;
          }
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that recipe',
            description: buyingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const changeStatus = (next: BomStatus) => {
    setStatus.mutate(next, {
      onSuccess: () => {
        toast.add({
          title:
            next === 'active'
              ? 'This is now the recipe you build to'
              : next === 'archived'
                ? 'Retired'
                : 'Back to draft',
          description:
            next === 'active'
              ? 'Any earlier version of this recipe has been retired, so there is one answer to what this is made of.'
              : undefined,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not change that',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${draft.name || 'this recipe'}?`,
      description:
        'Anything already made stays exactly as it is. Only the recipe itself goes. If runs have been built to it, retire it instead — they point at it to say what they were made of.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    removeBom.mutate(id, {
      onSuccess: () => {
        ctx.close();
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that recipe',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  if (!isNew && bom.isError) {
    const gone = isNotFound(bom.error);
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            reason={gone ? 'missing' : 'unreachable'}
            title={gone ? 'This recipe no longer exists' : 'Could not load it'}
            description={
              gone
                ? 'It may have been deleted.'
                : 'This is a problem reaching the server. The recipe is unaffected.'
            }
          />
        </Card>
      </div>
    );
  }

  if (!isNew && bom.isPending) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  const state = bomState(status);
  const perRun = parseInt10(draft.outputQuantity, 1);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Recipe actions"
        status={
          <>
            <span className="inline-flex items-center gap-1.5">
              <Icon glyph={faPotFood} className="size-4" aria-hidden />
              <Text as="span" className="text-sm font-medium">
                {isNew ? 'New recipe' : (bom.data?.name ?? 'Recipe')}
              </Text>
            </span>
            {isNew ? null : (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            )}
          </>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!canSave || !dirty}
            loading={saveBom.isPending}
            onClick={save}
          >
            <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            {!isNew && status === 'draft' ? (
              <Button
                size="sm"
                variant="outline"
                color="success"
                className="shrink-0"
                loading={setStatus.isPending}
                onClick={() => {
                  changeStatus('active');
                }}
              >
                Start using it
              </Button>
            ) : null}
            {!isNew && status === 'active' ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="shrink-0"
                loading={setStatus.isPending}
                onClick={() => {
                  changeStatus('archived');
                }}
              >
                Retire it
              </Button>
            ) : null}
            {!isNew ? (
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label="Delete this recipe"
                onClick={() => {
                  void remove();
                }}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              </Button>
            ) : null}
          </>
        }
        refresh={
          isNew ? null : (
            <RefreshButton
              isFetching={bom.isFetching}
              updatedAt={bom.dataUpdatedAt}
              onRefresh={() => {
                void bom.refetch();
              }}
            />
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* The number people open this screen for, at the top. */}
          {!isNew && buildable.data ? (
            <Card className="shrink-0">
              <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @2xl:grid-cols-3">
                <Stat>
                  <StatTitle>You could make</StatTitle>
                  <StatValue className="text-2xl tabular-nums">{buildable.data.quantity}</StatValue>
                  <StatDesc>
                    from what is free at{' '}
                    {activeLocations.find((l) => l.id === locationId)?.name ?? 'this location'}
                  </StatDesc>
                </Stat>
                <Stat>
                  <StatTitle>Runs out first</StatTitle>
                  <StatValue className="text-warning text-2xl">
                    {buildable.data.limitingSku ?? '—'}
                  </StatValue>
                  <StatDesc>
                    {buildable.data.limitingSku
                      ? 'Order this to make more'
                      : 'Nothing is holding you back'}
                  </StatDesc>
                </Stat>
                <Stat>
                  <StatTitle>Costs about</StatTitle>
                  <StatValue className="text-2xl tabular-nums">
                    {formatCents(bom.data?.estimatedUnitCostCents ?? 0)}
                  </StatValue>
                  <StatDesc>
                    each, at today&apos;s part prices — what a batch really costs is settled when
                    you make one
                  </StatDesc>
                </Stat>
              </Stats>
            </Card>
          ) : null}

          <FormSection title="What it makes">
            {draft.outputVariantId === '' ? (
              <Field>
                <FieldLabel required>Product code</FieldLabel>
                <div className="flex gap-2">
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        placeholder="The code of the thing being made"
                        spellCheck={false}
                        value={outputSkuEntry}
                        onChange={(event) => {
                          setOutputSkuEntry(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          setOutput();
                        }}
                      />
                    }
                  />
                  <Button
                    color="module"
                    variant="outline"
                    loading={lookup.isPending}
                    onClick={setOutput}
                  >
                    Find it
                  </Button>
                </div>
                <FieldDescription>
                  The finished item this recipe produces. It cannot also be one of the ingredients.
                </FieldDescription>
              </Field>
            ) : (
              <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="flex min-w-0 flex-col">
                  <Text className="font-mono font-medium">{draft.outputSku}</Text>
                  <Text className="text-sm">{bom.data?.outputTitle ?? 'The finished item'}</Text>
                </span>
                {isNew ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    onClick={() => {
                      setDraft((d) => ({ ...d, outputVariantId: '', outputSku: '' }));
                    }}
                  >
                    Change
                  </Button>
                ) : null}
              </div>
            )}

            <div className="grid gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel required>What to call this recipe</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      maxLength={127}
                      disabled={!editable}
                      value={draft.name}
                      onChange={(event) => {
                        setDraft((d) => ({ ...d, name: event.target.value }));
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel required>Makes, per run</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className="text-right tabular-nums"
                      disabled={!editable}
                      value={draft.outputQuantity}
                      onChange={(event) => {
                        setDraft((d) => ({ ...d, outputQuantity: event.target.value }));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  How many finished ones come out of one batch. The quantities below are for a whole
                  batch.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Time cost, per run</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="text-right tabular-nums"
                      disabled={!editable}
                      value={draft.laborCost}
                      onChange={(event) => {
                        setDraft((d) => ({ ...d, laborCost: event.target.value }));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  What the work costs you. Left at nothing, you are pricing your own time at zero.
                </FieldDescription>
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="What goes into it"
            description="Quantities are for ONE RUN of the batch size above — not per finished item."
          >
            {editable ? (
              <div className="flex gap-2">
                <Input
                  color="module"
                  className="max-w-64"
                  placeholder="Add a part by its code…"
                  aria-label="Add a part by its code"
                  spellCheck={false}
                  value={skuEntry}
                  onChange={(event) => {
                    setSkuEntry(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addComponent();
                  }}
                />
                <Button
                  variant="outline"
                  color="neutral"
                  loading={lookup.isPending}
                  onClick={addComponent}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Add
                </Button>
              </div>
            ) : null}

            {draft.components.length === 0 ? (
              <Text className="text-sm">
                Nothing yet. Add the parts this is made of — a recipe with no ingredients cannot be
                built from.
              </Text>
            ) : (
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="w-28 text-right whitespace-nowrap">Per run</th>
                    <th className="hidden w-28 text-right whitespace-nowrap @md:table-cell">
                      Waste %
                    </th>
                    <th className="hidden text-right whitespace-nowrap @lg:table-cell">
                      Actually pull
                    </th>
                    <th className="w-10" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {draft.components.map((component, index) => {
                    const quantity = parseInt10(component.quantityPer, 0);
                    const scrap = Number(component.scrapPercent) || 0;
                    const withScrap = Math.ceil(quantity * (1 + scrap / 100));
                    return (
                      <tr key={component.variantId}>
                        <td className="w-full max-w-0">
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {component.productTitle || 'Untitled product'}
                            </span>
                            <span className="truncate font-mono text-sm">
                              {component.variantSku}
                            </span>
                          </span>
                        </td>
                        <td>
                          <Input
                            color="module"
                            size="sm"
                            type="number"
                            min={1}
                            inputMode="numeric"
                            aria-label={`Quantity per run for ${component.variantSku}`}
                            className="w-24 text-right tabular-nums"
                            disabled={!editable}
                            value={component.quantityPer}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraft((d) => ({
                                ...d,
                                components: d.components.map((c, i) =>
                                  i === index ? { ...c, quantityPer: value } : c
                                ),
                              }));
                            }}
                          />
                        </td>
                        <td className="hidden @md:table-cell">
                          <Input
                            color="module"
                            size="sm"
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`Waste percent for ${component.variantSku}`}
                            className="w-24 text-right tabular-nums"
                            disabled={!editable}
                            value={component.scrapPercent}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraft((d) => ({
                                ...d,
                                components: d.components.map((c, i) =>
                                  i === index ? { ...c, scrapPercent: value } : c
                                ),
                              }));
                            }}
                          />
                        </td>
                        {/* Waste is a plan, and showing what it actually costs
                            you to pull is what makes a 20% figure feel real. */}
                        <td className="hidden text-right tabular-nums @lg:table-cell">
                          {withScrap > quantity ? (
                            <Badge color="warning" variant="soft" size="sm">
                              {withScrap}
                            </Badge>
                          ) : (
                            withScrap
                          )}
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="ghost"
                            color="danger"
                            shape="square"
                            aria-label={`Remove ${component.variantSku}`}
                            disabled={!editable}
                            onClick={() => {
                              setDraft((d) => ({
                                ...d,
                                components: d.components.filter((_, i) => i !== index),
                              }));
                            }}
                          >
                            <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}

            {draft.components.length > 0 ? (
              <Text className="text-sm">
                {plural(draft.components.length, 'part', 'parts')} to make {perRun} finished{' '}
                {perRun === 1 ? 'one' : 'ones'}.
              </Text>
            ) : null}
          </FormSection>

          {/* What can be made, per component — the detail behind the headline. */}
          {!isNew && buildable.data && buildable.data.components.length > 0 ? (
            <section className="card bg-base-100 flex flex-col gap-3 p-4">
              <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Heading level={2} className="flex items-center gap-2 text-lg font-semibold">
                    <Icon glyph={faHammer} className="size-4" aria-hidden />
                    What the shelves allow
                  </Heading>
                  <Text className="text-sm">
                    Counted against what is genuinely free — parts already promised to a customer
                    order are not counted twice.
                  </Text>
                </div>
                <NativeSelect
                  size="sm"
                  className="max-w-40"
                  aria-label="Location"
                  value={locationId}
                  onChange={(event) => {
                    setLocationId(event.target.value);
                  }}
                >
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="text-right whitespace-nowrap">Free here</th>
                    <th className="hidden text-right whitespace-nowrap @md:table-cell">
                      Needed per run
                    </th>
                    <th className="text-right whitespace-nowrap">Allows</th>
                  </tr>
                </thead>
                <tbody>
                  {buildable.data.components.map((component) => (
                    <tr key={component.variantId}>
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">
                            {component.productTitle ?? 'Untitled product'}
                          </span>
                          <span className="truncate font-mono text-sm">
                            {component.variantSku ?? 'No code'}
                          </span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{component.available}</td>
                      <td className="hidden text-right tabular-nums @md:table-cell">
                        {component.requiredPerBatch}
                      </td>
                      <td className="text-right">
                        <Badge
                          color={
                            component.isLimiting
                              ? 'warning'
                              : buildableTone(component.supports, buildable.data.quantity)
                          }
                          variant="soft"
                          size="sm"
                        >
                          {component.isLimiting
                            ? `${String(component.supports)} — runs out first`
                            : component.supports}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          ) : null}

          <FormSection title="Notes">
            <Field>
              <FieldLabel>Anything worth recording</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    disabled={!editable}
                    placeholder="How it is put together, what to watch out for…"
                    value={draft.notes}
                    onChange={(event) => {
                      setDraft((d) => ({ ...d, notes: event.target.value }));
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          {status === 'archived' ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>This recipe is retired</AlertTitle>
                <AlertDescription>
                  It is kept because runs built to it point here to say what they were made of. Copy
                  it to a new version rather than editing what past batches claim to be.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
