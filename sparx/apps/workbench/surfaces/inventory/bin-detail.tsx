'use client';

// ONE SHELF — what it is, and what is on it.
//
// ── Identity once, in the form ───────────────────────────────────────────
//
// The label IS the editable field, not also a read-only heading above it. The
// lifecycle (archive) sits in the pane's own chrome, not a bespoke "Status" card
// in the body.
//
// ── The contents are the point ───────────────────────────────────────────
//
// A shelf's settings are eight fields somebody fills in once. What people open
// this for is what is ON it — so the contents sit directly under the form rather
// than behind a tab, and each row opens that item's stock.
//
// ── Archiving is refused while it holds stock ────────────────────────────
//
// The server refuses and says why. That is not a nuisance: archiving a shelf
// with units on it makes them invisible while they still count toward the
// location total, so the numbers still add up and nobody can find the difference.

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Table,
  Text,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { Archive, Grid3x3, QrCode, Save } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import {
  BIN_TYPES,
  binTypeLabel,
  binTypeTone,
  useArchiveBin,
  useBin,
  useBinContents,
  useCreateBin,
  useUpdateBin,
  type Bin,
} from './bins-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';
const NUMBER = new Intl.NumberFormat();

interface Draft {
  warehouseId: string;
  code: string;
  name: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  type: string;
  pickSequence: string;
  capacityUnits: string;
  notes: string;
}

const EMPTY: Draft = {
  warehouseId: '',
  code: '',
  name: '',
  zone: '',
  aisle: '',
  rack: '',
  shelf: '',
  type: 'pick',
  pickSequence: '',
  capacityUnits: '',
  notes: '',
};

function draftFrom(bin: Bin): Draft {
  return {
    warehouseId: bin.warehouseId,
    code: bin.code,
    name: bin.name ?? '',
    zone: bin.zone ?? '',
    aisle: bin.aisle ?? '',
    rack: bin.rack ?? '',
    shelf: bin.shelf ?? '',
    type: bin.type,
    pickSequence: bin.pickSequence === null ? '' : String(bin.pickSequence),
    capacityUnits: bin.capacityUnits === null ? '' : String(bin.capacityUnits),
    notes: bin.notes ?? '',
  };
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function BinDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const toast = useToast();
  const confirm = useConfirm();
  const bin = useBin(isNew ? undefined : id);
  const contents = useBinContents(isNew ? undefined : id);
  const locations = useStockLocations();
  const create = useCreateBin();
  const update = useUpdateBin();
  const archive = useArchiveBin();

  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew) {
      // Pre-select when there is only one place it could be. A required picker
      // with one option is a question with one answer.
      if (!loaded && activeLocations.length === 1) {
        setDraft((d) => ({ ...d, warehouseId: activeLocations[0]?.id ?? '' }));
        setLoaded(true);
      }
      return;
    }
    if (bin.data && !loaded) {
      setDraft(draftFrom(bin.data));
      setLoaded(true);
      ctx.setTitle(bin.data.code);
    }
  }, [bin.data, isNew, loaded, activeLocations, ctx]);

  const original = bin.data ? draftFrom(bin.data) : EMPTY;
  const changed = JSON.stringify(draft) !== JSON.stringify(isNew ? EMPTY : original);
  const valid = draft.code.trim() !== '' && draft.warehouseId !== '';
  const isSystem = bin.data?.isSystem ?? false;

  useDirtySource(
    changed && valid,
    `The shelf ${draft.code || 'you are adding'} has unsaved changes. Close anyway?`
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const submit = () => {
    if (!valid) return;
    const payload = {
      warehouseId: draft.warehouseId,
      code: draft.code.trim(),
      type: draft.type,
      ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      ...(draft.zone.trim() ? { zone: draft.zone.trim() } : {}),
      ...(draft.aisle.trim() ? { aisle: draft.aisle.trim() } : {}),
      ...(draft.rack.trim() ? { rack: draft.rack.trim() } : {}),
      ...(draft.shelf.trim() ? { shelf: draft.shelf.trim() } : {}),
      ...(draft.pickSequence.trim() ? { pickSequence: Number(draft.pickSequence) } : {}),
      ...(draft.capacityUnits.trim() ? { capacityUnits: Number(draft.capacityUnits) } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };

    const onError = (error: unknown) => {
      toast.add({
        title: 'Could not save that shelf',
        description: stockErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    };

    if (isNew) {
      create.mutate(payload, {
        onSuccess: (saved) => {
          setLoaded(false);
          ctx.open('inventory.bins.detail', { id: saved.id });
          afterPaneChange(() => {
            toast.add({ title: `${saved.code} added`, type: 'success' });
          });
        },
        onError,
      });
      return;
    }

    update.mutate(
      { id, ...payload },
      {
        onSuccess: () => {
          setLoaded(false);
          toast.add({ title: `${payload.code} saved`, type: 'success' });
        },
        onError,
      }
    );
  };

  const onArchive = async () => {
    const held = bin.data?.unitCount ?? 0;
    const ok = await confirm({
      title: `Remove ${bin.data?.code ?? 'this shelf'}?`,
      description:
        held > 0
          ? `It still holds ${plural(held, 'unit', 'units')}. Move them to another shelf first — otherwise they stay counted in your totals but nobody can find them.`
          : 'It will stop appearing in shelf pickers. Its history is kept.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    archive.mutate(id, {
      onSuccess: () => {
        ctx.close();
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove that shelf',
          description: stockErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const rows = contents.data ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Shelf controls"
        primary={
          <Button
            color="module-inventory"
            size="sm"
            disabled={!valid || !changed || create.isPending || update.isPending}
            onClick={submit}
          >
            <Save className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            {!isNew && !isSystem ? (
              <Tooltip content="Remove this shelf">
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  aria-label="Remove this shelf"
                  onClick={() => void onArchive()}
                >
                  <Archive className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
            {!isNew ? (
              <Tooltip content="Print a label for this shelf">
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  aria-label="Print a label for this shelf"
                  onClick={() => {
                    ctx.open('inventory.bins.labels', { binId: id }, { target: 'beside' });
                  }}
                >
                  <QrCode className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={bin.isFetching || contents.isFetching}
            updatedAt={bin.data ? bin.dataUpdatedAt : undefined}
            onRefresh={() => {
              setLoaded(false);
              void bin.refetch();
              void contents.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isSystem ? (
            <Text className="text-sm">
              This shelf is provided by sparx. You can rename it and set where it falls in the pick
              order; its label and kind are fixed because other parts of the system look for it.
            </Text>
          ) : null}

          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <Heading level={2} className="text-lg font-semibold">
              What this shelf is
            </Heading>

            <Field>
              <FieldLabel>Label</FieldLabel>
              <FieldDescription>
                What is written on the shelf. People type this on a phone next to the rack, so keep
                it short.
              </FieldDescription>
              <FieldControl
                render={
                  <Input
                    value={draft.code}
                    disabled={isSystem}
                    placeholder="A-01-03"
                    onChange={(event) => {
                      set('code', event.target.value.toUpperCase());
                    }}
                  />
                }
              />
            </Field>

            <Field>
              <FieldLabel>Location</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={draft.warehouseId}
                    disabled={!isNew}
                    onChange={(event) => {
                      set('warehouseId', event.target.value);
                    }}
                  >
                    <option value="">Choose a location…</option>
                    {activeLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              {!isNew ? (
                <FieldDescription>
                  A shelf cannot move between locations. Add one at the other place instead.
                </FieldDescription>
              ) : null}
            </Field>

            <Field>
              <FieldLabel>Kind</FieldLabel>
              <FieldDescription>
                {BIN_TYPES.find((t) => t.value === draft.type)?.hint ?? ''}
              </FieldDescription>
              <FieldControl
                render={
                  <NativeSelect
                    value={draft.type}
                    disabled={isSystem}
                    onChange={(event) => {
                      set('type', event.target.value);
                    }}
                  >
                    {BIN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
            </Field>

            <Field>
              <FieldLabel>Description</FieldLabel>
              <FieldControl
                render={
                  <Input
                    value={draft.name}
                    placeholder="Front bay, top shelf"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </section>

          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-0.5">
              <Heading level={2} className="text-lg font-semibold">
                Where it is
              </Heading>
              <Text className="text-sm">
                Fill in whichever of these your place actually uses — they are only here to group
                and find shelves, so blanks are fine.
              </Text>
            </div>
            <div className="grid grid-cols-1 gap-3 @lg:grid-cols-4">
              {(
                [
                  ['zone', 'Zone'],
                  ['aisle', 'Aisle'],
                  ['rack', 'Rack'],
                  ['shelf', 'Shelf'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        value={draft[key]}
                        onChange={(event) => {
                          set(key, event.target.value);
                        }}
                      />
                    }
                  />
                </Field>
              ))}
            </div>
          </section>

          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <Heading level={2} className="text-lg font-semibold">
              How it is worked
            </Heading>

            <Field>
              <FieldLabel>Walk order</FieldLabel>
              <FieldDescription>
                Lower numbers come first when someone is picking. Leave it blank and this shelf
                sorts to the end.
              </FieldDescription>
              <FieldControl
                render={
                  <Input
                    type="number"
                    min={0}
                    value={draft.pickSequence}
                    onChange={(event) => {
                      set('pickSequence', event.target.value);
                    }}
                  />
                }
              />
            </Field>

            <Field>
              <FieldLabel>How much it holds</FieldLabel>
              <FieldDescription>
                A guide, not a limit. Nothing is ever refused for going over — a system that will
                not let you record where something actually is just gets worked around.
              </FieldDescription>
              <FieldControl
                render={
                  <Input
                    type="number"
                    min={1}
                    value={draft.capacityUnits}
                    onChange={(event) => {
                      set('capacityUnits', event.target.value);
                    }}
                  />
                }
              />
            </Field>

            <Field>
              <FieldLabel>Notes</FieldLabel>
              <FieldControl
                render={
                  <Input
                    value={draft.notes}
                    onChange={(event) => {
                      set('notes', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </section>

          {!isNew ? (
            <section className="card bg-base-100 flex flex-col gap-3 p-4">
              <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Heading level={2} className="text-lg font-semibold">
                    What is on it
                  </Heading>
                  <Text className="text-sm">
                    {bin.data
                      ? `${plural(bin.data.itemCount, 'item', 'items')} · ${plural(bin.data.unitCount, 'unit', 'units')}`
                      : ''}
                  </Text>
                </div>
                {bin.data ? (
                  <Badge color={binTypeTone(bin.data.type)} variant="soft">
                    {binTypeLabel(bin.data.type)}
                  </Badge>
                ) : null}
              </div>

              {rows.length === 0 ? (
                <Text className="text-sm">
                  Nothing is recorded on this shelf. It will fill up as deliveries are put away
                  here.
                </Text>
              ) : (
                <Table className="table-sm">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Here</th>
                      <th className="hidden @lg:table-cell">Last checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.variantId}
                        className="hover:bg-base-200 cursor-pointer"
                        tabIndex={0}
                        onClick={(event) => {
                          ctx.open(
                            'inventory.stock.item',
                            { variantId: row.variantId },
                            { target: targetFor(event) }
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          ctx.open('inventory.stock.item', { variantId: row.variantId });
                        }}
                      >
                        <td className="max-w-56">
                          <span className="block truncate font-medium">
                            {row.productTitle ?? row.sku ?? 'Unnamed item'}
                          </span>
                          {row.sku ? (
                            <span className="truncate font-mono text-sm">{row.sku}</span>
                          ) : null}
                        </td>
                        <td className="text-right font-medium tabular-nums">
                          {NUMBER.format(row.onHand)}
                        </td>
                        <td className="hidden whitespace-nowrap @lg:table-cell">
                          {row.lastCountedAt ? (
                            <Timestamp value={row.lastCountedAt} format="relative" />
                          ) : (
                            <Text className="text-sm">Never</Text>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </section>
          ) : null}

          {isNew && activeLocations.length === 0 ? (
            <EmptyState
              icon={<Grid3x3 className="size-6" aria-hidden />}
              title="No locations yet"
              description="A shelf lives inside a location, so add the place first."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
