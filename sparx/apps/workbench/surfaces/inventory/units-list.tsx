'use client';

// UNITS — the words you count in.
//
// ── Why this is a screen and not a dropdown someone types into ───────────
//
// "CS" means a case of twelve to one business and a case of six to another, and
// what it means for a given ITEM is set on that item. This screen owns the
// vocabulary: the short codes that appear on purchase orders and delivery notes,
// and what each one is called when a sentence has to read properly. Getting the
// plural wrong here is how a screen ends up saying "2 boxs".
//
// ── The list is seeded, and says so ──────────────────────────────────────
//
// A business that opens this finds fourteen sensible units already there rather
// than an empty table asking them to invent "EA". They are marked as ours, so
// the distinction between "we started you off with this" and "we set this up"
// stays visible — and deleting them all is honoured rather than quietly undone
// the next time the screen loads.
//
// ── Deleting is refused, with a number ───────────────────────────────────
//
// A unit in use on twelve items cannot be deleted, and the message says twelve.
// A disabled button with no explanation is how someone concludes the software is
// broken. Documents already written keep their unit either way — they hold the
// code as text, which is exactly why they hold it as text.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
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
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Plus, Ruler, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import { buyingErrorMessage } from './suppliers-data';
import {
  useCreateUnit,
  useDeleteUnit,
  useUnitsOfMeasure,
  useUpdateUnit,
  type UnitOfMeasure,
  type UomDimension,
} from './assembly-data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/** What kind of thing a unit measures, said the way a person would. Grouping the
 *  list by this is the only reason it exists — a business with fourteen units
 *  should not have to read past the weights to find "case". */
const DIMENSIONS: { value: UomDimension; label: string }[] = [
  { value: 'count', label: 'Counting things' },
  { value: 'weight', label: 'Weight' },
  { value: 'volume', label: 'Volume' },
  { value: 'length', label: 'Length' },
  { value: 'area', label: 'Area' },
];

export function UnitsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const units = useUnitsOfMeasure(true);
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();

  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pluralName, setPluralName] = useState('');
  const [dimension, setDimension] = useState<UomDimension>('count');

  const rows = units.data ?? [];
  const canSave = code.trim() !== '' && name.trim() !== '';

  const resetForm = () => {
    setCode('');
    setName('');
    setPluralName('');
    setDimension('count');
  };

  const save = () => {
    if (!canSave) return;
    createUnit.mutate(
      {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        ...(pluralName.trim() ? { pluralName: pluralName.trim() } : {}),
        dimension,
      },
      {
        onSuccess: (unit) => {
          setAdding(false);
          resetForm();
          toast.add({
            title: `${unit.code} added`,
            description: `You can now set what a ${unit.name} means on each item that comes in one.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that unit',
            description: buyingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const remove = async (unit: UnitOfMeasure) => {
    const ok = await confirm({
      title: `Delete ${unit.code}?`,
      description:
        'Purchase orders and deliveries already written keep this unit — they record the code as it was. Only new entries lose it.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    deleteUnit.mutate(unit.id, {
      onError: (error) => {
        toast.add({
          title: `Could not delete ${unit.code}`,
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const toggleActive = (unit: UnitOfMeasure) => {
    updateUnit.mutate(
      { id: unit.id, isActive: !unit.isActive },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: buyingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const body = () => {
    if (units.isError) {
      return (
        <EmptyState
          icon={<Ruler className="size-6" aria-hidden />}
          title="Could not load your units"
          description="This is a problem reaching the server. Your units and everything measured in them are unaffected."
        />
      );
    }
    if (units.isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      );
    }

    const grouped = DIMENSIONS.map((d) => ({
      dimension: d,
      units: rows.filter((u) => u.dimension === d.value),
    })).filter((g) => g.units.length > 0);

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            Units
          </Heading>
          <Text>
            The words you count in — each, case, box, pair. How many singles are in a case is set on
            each item, because a case of one thing is rarely a case of another.
          </Text>
        </div>

        {adding ? (
          <FormSection
            title="A new unit"
            description="Just the word and its short code. What it CONTAINS is set per item, on that item's page."
          >
            <div className="grid gap-3 @lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Field>
                <FieldLabel required>Code</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      maxLength={12}
                      spellCheck={false}
                      className="uppercase"
                      placeholder="CS"
                      aria-label="Short code"
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value.toUpperCase());
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel required>One of them is a…</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      maxLength={60}
                      placeholder="case"
                      aria-label="Singular name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Several of them are…</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      maxLength={60}
                      placeholder={name ? `${name}s` : 'cases'}
                      aria-label="Plural name"
                      value={pluralName}
                      onChange={(event) => {
                        setPluralName(event.target.value);
                      }}
                    />
                  }
                />
                {/* The reason this field exists at all. */}
                <FieldDescription>
                  Only needed when adding an &quot;s&quot; would be wrong — boxes, not boxs.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Measures</FieldLabel>
                <NativeSelect
                  aria-label="What it measures"
                  value={dimension}
                  onChange={(event) => {
                    setDimension(event.target.value as UomDimension);
                  }}
                >
                  {DIMENSIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                color="module"
                disabled={!canSave}
                loading={createUnit.isPending}
                onClick={save}
              >
                Add it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </FormSection>
        ) : null}

        {rows.length === 0 ? (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>No units yet</AlertTitle>
              <AlertDescription>
                Add the first one above. Most businesses need only a handful — whatever they buy and
                sell things by.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : (
          grouped.map((group) => (
            <section
              key={group.dimension.value}
              className="card bg-base-100 flex flex-col gap-3 p-4"
            >
              <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
                <Heading level={2} className="text-lg font-semibold">
                  {group.dimension.label}
                </Heading>
              </div>
              <Table size="sm">
                <thead>
                  <tr>
                    <th className="w-20">Code</th>
                    <th>Called</th>
                    <th className="hidden text-right @md:table-cell">Used on</th>
                    <th className="w-24" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {group.units.map((unit) => (
                    <tr key={unit.id}>
                      <td className="font-mono font-medium">{unit.code}</td>
                      <td>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">
                            1 {unit.name} · 2 {unit.pluralName}
                          </span>
                          {unit.isSystem ? (
                            <span className="text-sm">We started you off with this one</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="hidden text-right @md:table-cell">
                        {unit.usageCount === 0 ? (
                          <Text as="span" className="text-sm">
                            Nothing yet
                          </Text>
                        ) : (
                          <Badge color="module" variant="soft" size="sm">
                            {plural(unit.usageCount, 'item', 'items')}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <span className="flex items-center justify-end gap-1">
                          {/* Switching off keeps history intact and takes it out
                              of the pickers — the answer for a unit you have
                              stopped using but cannot delete. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            color={unit.isActive ? 'neutral' : 'success'}
                            onClick={() => {
                              toggleActive(unit);
                            }}
                          >
                            {unit.isActive ? 'Switch off' : 'Switch on'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            color="danger"
                            shape="square"
                            aria-label={`Delete ${unit.code}`}
                            disabled={unit.usageCount > 0}
                            onClick={() => {
                              void remove(unit);
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          ))
        )}

        <Text className="text-sm">
          <span className="font-medium">Where the numbers come from.</span> A unit is only a word
          until an item says what it contains. Open any product&apos;s stock panel to say that a
          case of THAT thing is twelve — and from then on you can order, receive and count in cases,
          while your stock figures stay in singles.
        </Text>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Unit actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Ruler className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Units
            </Text>
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={adding}
            onClick={() => {
              setAdding(true);
              ctx.setTitle('Units');
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a unit
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={units.isFetching}
            updatedAt={units.dataUpdatedAt}
            onRefresh={() => {
              void units.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
