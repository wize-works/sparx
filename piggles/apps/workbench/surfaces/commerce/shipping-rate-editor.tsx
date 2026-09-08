'use client';

// The delivery options inside one region — the list, and the composer to add one.
//
// A rate is not part of the region's draft: it is created on the server the
// moment you add it (it needs a saved region to belong to) and removed on its
// own. So this component owns no unsaved-work of its own worth guarding — the
// composer is either empty or a few keystrokes away from a real Add. What a rate
// costs can be worked out five ways, and the fields change to match:
//
//   • A fixed price         — one amount, always.
//   • Free over an amount   — a price, waived once the order is big enough.
//   • By weight / value / item count — a set of price steps ("bands"), each with
//     a range and its own price. The unit of the range changes with the choice.

import { shownInPlace } from '@wizeworks/query';
import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NumberField,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { faPlus, faTrashCan, faXmark } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import type { CreateShippingRateInput } from '@wizeworks/commerce-schemas';
import { MoneyInput } from '../../components/money-input';
import { SaveFailure } from '@/components/save-failure';
import {
  rateTypeLabel,
  shippingErrorMessage,
  useCreateShippingRate,
  useDeleteShippingRate,
  useShippingProfiles,
  useZoneRates,
  type ShippingRate,
  type ShippingRateType,
} from './shipping-data';

function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

const TYPE_OPTIONS: { value: ShippingRateType; label: string }[] = [
  { value: 'flat', label: 'A fixed price' },
  { value: 'free_above_threshold', label: 'Free over a certain order value' },
  { value: 'by_price', label: 'Priced by order value' },
  { value: 'by_weight', label: 'Priced by weight' },
  { value: 'by_item_count', label: 'Priced by number of items' },
];

type BandUnit = 'money' | 'weight' | 'count';

function bandUnit(type: ShippingRateType): BandUnit {
  if (type === 'by_price') return 'money';
  if (type === 'by_weight') return 'weight';
  return 'count';
}

interface BandDraft {
  /** Lower bound, in the display unit (dollars, kg, or items). */
  min: number;
  /** Upper bound, in the display unit; empty string = "and above". */
  max: string;
  /** The delivery price for this band, in dollars. */
  amountDollars: number;
}

interface RateDraft {
  name: string;
  profileId: string;
  type: ShippingRateType;
  amountDollars: number;
  freeAboveDollars: number;
  bands: BandDraft[];
  carrier: string;
  estimatedDeliveryDays: string;
}

function emptyRateDraft(profileId: string): RateDraft {
  return {
    name: '',
    profileId,
    type: 'flat',
    amountDollars: 0,
    freeAboveDollars: 0,
    bands: [{ min: 0, max: '', amountDollars: 0 }],
    carrier: '',
    estimatedDeliveryDays: '',
  };
}

/** Convert a display value to the wire unit the band expects. */
function toWire(value: number, unit: BandUnit): number {
  if (unit === 'money') return Math.round(value * 100); // dollars → cents
  if (unit === 'weight') return Math.round(value * 1000); // kg → grams
  return Math.round(value); // items
}

function rateSummary(rate: ShippingRate): string {
  if (rate.type === 'flat')
    return rate.amountCents != null ? money(rate.amountCents, rate.currency) : '—';
  if (rate.type === 'free_above_threshold') {
    const base = rate.amountCents != null ? money(rate.amountCents, rate.currency) : '—';
    const over = rate.freeAboveCents != null ? money(rate.freeAboveCents, rate.currency) : '—';
    return `${base}, free over ${over}`;
  }
  const bands = rate.bands ?? [];
  if (bands.length === 0) return '—';
  const cheapest = Math.min(...bands.map((b) => b.amountCents));
  return `${bands.length} price ${bands.length === 1 ? 'step' : 'steps'}, from ${money(cheapest, rate.currency)}`;
}

/* ── The composer ───────────────────────────────────────────────────────── */

function RateComposer({
  zoneId,
  profiles,
  onDone,
}: {
  zoneId: string;
  profiles: { id: string; name: string }[];
  onDone: () => void;
}) {
  const toast = useToast();
  const create = useCreateShippingRate();
  const [draft, setDraft] = useState<RateDraft>(() => emptyRateDraft(profiles[0]?.id ?? ''));

  const set = <K extends keyof RateDraft>(key: K, value: RateDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const unit = bandUnit(draft.type);
  const isBand =
    draft.type === 'by_price' || draft.type === 'by_weight' || draft.type === 'by_item_count';
  const nameError = draft.name.trim() === '';
  const profileError = draft.profileId === '';

  const failure = create.isError
    ? shippingErrorMessage(create.error, 'Could not add this delivery option. Nothing was changed.')
    : null;

  const setBand = (index: number, patch: Partial<BandDraft>) => {
    setDraft((current) => ({
      ...current,
      bands: current.bands.map((band, i) => (i === index ? { ...band, ...patch } : band)),
    }));
  };

  const submit = () => {
    if (nameError || profileError) return;
    const base: CreateShippingRateInput = {
      zoneId,
      profileId: draft.profileId,
      name: draft.name.trim(),
      type: draft.type,
      currency: 'USD',
      ...(draft.carrier.trim() ? { carrier: draft.carrier.trim() } : {}),
      ...(draft.estimatedDeliveryDays.trim()
        ? { estimatedDeliveryDays: Math.max(1, Number(draft.estimatedDeliveryDays) || 1) }
        : {}),
    };

    let input: CreateShippingRateInput = base;
    if (draft.type === 'flat') {
      input = { ...base, amountCents: Math.round(draft.amountDollars * 100) };
    } else if (draft.type === 'free_above_threshold') {
      input = {
        ...base,
        amountCents: Math.round(draft.amountDollars * 100),
        freeAboveCents: Math.round(draft.freeAboveDollars * 100),
      };
    } else {
      input = {
        ...base,
        bands: draft.bands.map((band) => ({
          min: toWire(band.min, unit),
          ...(band.max.trim() ? { max: toWire(Number(band.max) || 0, unit) } : {}),
          amountCents: Math.round(band.amountDollars * 100),
        })),
      };
    }

    create.mutate(input, {
      onSuccess: () => {
        toast.add({ title: `${draft.name.trim()} added`, type: 'success' });
        onDone();
      },
      onError: shownInPlace,
    });
  };

  const unitLabel = unit === 'money' ? 'order value' : unit === 'weight' ? 'weight (kg)' : 'items';

  return (
    <div className="border-base-300 bg-base-200 flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <Text as="span" className="font-semibold">
          New delivery option
        </Text>
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label="Cancel"
          onClick={onDone}
        >
          <Icon glyph={faXmark} className="size-4" aria-hidden />
        </Button>
      </div>

      <SaveFailure title="Could not add this option" message={failure} />

      <Field>
        <FieldLabel>What shoppers see</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={draft.name}
              placeholder="Standard delivery"
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          The name of this option at checkout, e.g. Standard or Express.
        </FieldDescription>
      </Field>

      {profiles.length > 1 ? (
        <Field>
          <FieldLabel>Which products it applies to</FieldLabel>
          <FieldControl
            render={
              <Select
                color="module"
                aria-label="Which products it applies to"
                value={draft.profileId}
                items={profiles.map((p) => ({ value: p.id, label: p.name }))}
                onValueChange={(next) => {
                  set('profileId', (next as string) ?? '');
                }}
              />
            }
          />
          <FieldDescription>The product group this delivery option is for.</FieldDescription>
        </Field>
      ) : null}

      <Field>
        <FieldLabel>How the price works</FieldLabel>
        <FieldControl
          render={
            <Select
              color="module"
              aria-label="How the price works"
              value={draft.type}
              items={TYPE_OPTIONS}
              onValueChange={(next) => {
                set('type', (next as ShippingRateType) ?? 'flat');
              }}
            />
          }
        />
      </Field>

      {draft.type === 'flat' ? (
        <Field>
          <FieldLabel>Price</FieldLabel>
          <FieldControl
            render={
              <MoneyInput
                aria-label="Price"
                color="module"
                value={draft.amountDollars}
                onValueChange={(next) => {
                  set('amountDollars', next);
                }}
              />
            }
          />
          <FieldDescription>What the shopper pays for this delivery option.</FieldDescription>
        </Field>
      ) : null}

      {draft.type === 'free_above_threshold' ? (
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Price</FieldLabel>
            <FieldControl
              render={
                <MoneyInput
                  aria-label="Price"
                  color="module"
                  value={draft.amountDollars}
                  onValueChange={(next) => {
                    set('amountDollars', next);
                  }}
                />
              }
            />
            <FieldDescription>What the shopper pays on a normal order.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Free once the order reaches</FieldLabel>
            <FieldControl
              render={
                <MoneyInput
                  aria-label="Free once the order reaches"
                  color="module"
                  value={draft.freeAboveDollars}
                  onValueChange={(next) => {
                    set('freeAboveDollars', next);
                  }}
                />
              }
            />
            <FieldDescription>
              Orders at or above this total get this delivery free.
            </FieldDescription>
          </Field>
        </div>
      ) : null}

      {isBand ? (
        <div className="flex flex-col gap-3">
          <Text className="text-sm">
            Set a price for each range of {unitLabel}. Leave the &ldquo;up to&rdquo; box empty on
            the last step to mean &ldquo;and above&rdquo;.
          </Text>
          {draft.bands.map((band, index) => (
            <div
              key={index}
              className="border-base-300 bg-base-100 flex flex-wrap items-end gap-3 rounded-md border p-3"
            >
              <BandNumber
                label={`From (${unit === 'money' ? '$' : unit === 'weight' ? 'kg' : 'items'})`}
                unit={unit}
                value={band.min}
                onChange={(next) => {
                  setBand(index, { min: next });
                }}
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Up to</span>
                <Input
                  size="sm"
                  color="module"
                  className="max-w-[8rem] tabular-nums"
                  inputMode="decimal"
                  aria-label="Up to"
                  placeholder="and above"
                  value={band.max}
                  onChange={(event) => {
                    setBand(index, { max: event.target.value });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Costs</span>
                <MoneyInput
                  aria-label="Costs"
                  color="module"
                  value={band.amountDollars}
                  onValueChange={(next) => {
                    setBand(index, { amountDollars: next });
                  }}
                />
              </div>
              {draft.bands.length > 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  aria-label="Remove this step"
                  onClick={() => {
                    set(
                      'bands',
                      draft.bands.filter((_, i) => i !== index)
                    );
                  }}
                >
                  <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              onClick={() => {
                set('bands', [...draft.bands, { min: 0, max: '', amountDollars: 0 }]);
              }}
            >
              <Icon glyph={faPlus} className="size-4" aria-hidden />
              Add a price step
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-[10rem] flex-1">
          <FieldLabel>Carrier name (optional)</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.carrier}
                placeholder="e.g. Royal Mail"
                onChange={(event) => {
                  set('carrier', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field className="min-w-[8rem]">
          <FieldLabel>Arrives in (days)</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                className="max-w-[7rem] tabular-nums"
                inputMode="numeric"
                value={draft.estimatedDeliveryDays}
                placeholder="e.g. 3"
                onChange={(event) => {
                  set('estimatedDeliveryDays', event.target.value.replace(/[^0-9]/g, ''));
                }}
              />
            }
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          color="module"
          loading={create.isPending}
          disabled={nameError || profileError}
          onClick={submit}
        >
          Add this option
        </Button>
      </div>
    </div>
  );
}

function BandNumber({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: BandUnit;
  value: number;
  onChange: (value: number) => void;
}) {
  if (unit === 'money') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <MoneyInput aria-label={label} color="module" value={value} onValueChange={onChange} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <NumberField
        label={label}
        className="max-w-[8rem]"
        min={0}
        value={value}
        onValueChange={(next) => {
          onChange(typeof next === 'number' && !Number.isNaN(next) ? next : 0);
        }}
      />
    </div>
  );
}

/* ── The list + editor ──────────────────────────────────────────────────── */

export function ZoneRatesEditor({ zoneId }: { zoneId: string }) {
  const rates = useZoneRates(zoneId);
  const profiles = useShippingProfiles();
  const remove = useDeleteShippingRate();
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const profileList = (profiles.data?.items ?? []).map((p) => ({ id: p.id, name: p.name }));
  const nameById = new Map(profileList.map((p) => [p.id, p.name]));
  const rows = rates.data ?? [];

  const onDelete = (rate: ShippingRate) => {
    void (async () => {
      const ok = await confirm({
        title: `Remove ${rate.name}?`,
        description:
          'Shoppers in this region will no longer see this delivery option. This cannot be undone.',
        confirmLabel: 'Remove it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      remove.mutate(rate.id, {
        onSuccess: () => {
          toast.add({ title: `${rate.name} removed`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not remove that option',
            description: shippingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  return (
    <div className="flex flex-col gap-3">
      {rates.isError ? (
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not load the delivery options</AlertTitle>
            <AlertDescription>
              {shippingErrorMessage(rates.error, 'This is a problem reaching the server.')}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : rates.isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : rows.length === 0 && !adding ? (
        <Text className="text-sm">
          No delivery options here yet. Add one so shoppers in this region have something to choose
          at checkout.
        </Text>
      ) : (
        <div className="flex flex-col">
          {rows.map((rate) => (
            <div
              key={rate.id}
              className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{rate.name}</span>
                <Text as="span" className="text-sm">
                  {rateSummary(rate)}
                  {rate.estimatedDeliveryDays
                    ? ` · arrives in about ${String(rate.estimatedDeliveryDays)} day${rate.estimatedDeliveryDays === 1 ? '' : 's'}`
                    : ''}
                </Text>
              </span>
              <Badge color="neutral" variant="soft" size="sm">
                {rateTypeLabel(rate.type)}
              </Badge>
              {profileList.length > 1 && nameById.get(rate.profileId) ? (
                <Badge color="info" variant="soft" size="sm">
                  {nameById.get(rate.profileId)}
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label={`Remove ${rate.name}`}
                loading={remove.isPending && remove.variables === rate.id}
                onClick={() => {
                  onDelete(rate);
                }}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        profileList.length === 0 ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>Add a product group first</AlertTitle>
              <AlertDescription>
                A delivery option needs a product group to apply to. Add one from the Shipping
                screen, then come back.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : (
          <RateComposer
            zoneId={zoneId}
            profiles={profileList}
            onDone={() => {
              setAdding(false);
            }}
          />
        )
      ) : (
        <div>
          <Button
            size="sm"
            color="module"
            variant="soft"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Add a delivery option
          </Button>
        </div>
      )}
    </div>
  );
}
