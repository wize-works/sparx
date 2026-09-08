'use client';

// One delivery region — create it, then manage the delivery options inside it.
//
// Create and manage are the same surface: `{ id: 'new' }` builds it, `{ id }`
// manages it. The region itself (its name, where it covers, its priority) is a
// draft you Save. Its DELIVERY OPTIONS are different: each one is added or
// removed on its own, saved the moment you add it, because a rate has to hang
// off a region that already exists. So the region can only gain options once it
// has been created — before then, the options section says so rather than
// pretending.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  NumberField,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { countryOptions, coverageSummary } from './geo';
import { ZoneRatesEditor } from './shipping-rate-editor';
import { SaveFailure } from '@/components/save-failure';
import {
  shippingErrorMessage,
  useCreateShippingZone,
  useDeleteShippingZone,
  useShippingZone,
  useUpdateShippingZone,
  type ShippingZone,
} from './shipping-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

interface Draft {
  name: string;
  countries: string[];
  priority: number;
}

function toDraft(zone: ShippingZone): Draft {
  return { name: zone.name, countries: zone.targeting.countries, priority: zone.priority };
}

function emptyDraft(): Draft {
  return { name: '', countries: [], priority: 0 };
}

export function ShippingZoneDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <ZoneEditor ctx={ctx} id="new" /> : <ZoneLoader ctx={ctx} id={id} />;
}

function ZoneLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: zone,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useShippingZone(id);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="delivery region"
            title="Could not load this delivery region"
            description="This is a problem reaching the server. The region itself is unaffected — nothing has been lost."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !zone) {
    return <PaneWaiting />;
  }

  return (
    <ZoneEditor
      ctx={ctx}
      id={id}
      zone={zone}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

function ZoneEditor({
  ctx,
  id,
  zone,
  isFetching = false,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  zone?: ShippingZone;
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateShippingZone();
  const update = useUpdateShippingZone(id);
  const remove = useDeleteShippingZone(id);

  const saved = useMemo(() => (zone ? toDraft(zone) : emptyDraft()), [zone]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New delivery region' : (zone?.name ?? 'Delivery region'));
  }, [ctx, isNew, zone]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const nameError = draft.name.trim() === '' ? 'Give this region a name.' : null;

  const dirty = isNew
    ? draft.name.trim() !== '' || draft.countries.length > 0 || draft.priority !== 0
    : draft.name !== saved.name ||
      draft.priority !== saved.priority ||
      draft.countries.join(',') !== saved.countries.join(',');

  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This delivery region has not been created yet. Close anyway?'
      : 'This delivery region has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError
      ? shippingErrorMessage(
          create.error ?? update.error,
          'Could not save this region. Nothing was changed.'
        )
      : null;

  const submit = () => {
    if (nameError) return;
    const input = {
      name: draft.name.trim(),
      priority: draft.priority,
      targeting: { countries: draft.countries, regions: [], postalCodeRanges: [] },
    };
    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('commerce.shipping.zone.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${draft.name.trim()} created`, type: 'success' });
          });
        },
        onError: shownInPlace,
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Region saved', type: 'success' });
      },
      onError: shownInPlace,
    });
  };

  const onDelete = async () => {
    if (!zone) return;
    const ok = await confirm({
      title: `Delete ${zone.name}?`,
      description:
        zone.rateCount > 0
          ? `This region and its ${String(zone.rateCount)} delivery option${zone.rateCount === 1 ? '' : 's'} are removed. Shoppers in this region will fall back to another region that covers them — or, if you have no regions left, to collecting from you. This cannot be undone.`
          : 'This region is removed. This cannot be undone.',
      confirmLabel: 'Delete this region',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${zone.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this region',
          description: shippingErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const everywhere = draft.countries.length === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Delivery region actions"
        status={
          !isNew ? (
            <Badge
              color={zone && zone.rateCount > 0 ? 'success' : 'warning'}
              variant="soft"
              size="sm"
            >
              {zone && zone.rateCount > 0
                ? `${String(zone.rateCount)} delivery option${zone.rateCount === 1 ? '' : 's'}`
                : 'No delivery options'}
            </Badge>
          ) : null
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(nameError) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create region' : 'Save'}
          </Button>
        }
        refresh={
          onRefresh ? (
            <RefreshButton
              isFetching={isFetching}
              updatedAt={zone ? updatedAt : undefined}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <Text>
              A region is a set of places you deliver to. Name it, choose where it covers, then —
              once it exists — add the delivery options shoppers there can pick from.
            </Text>
          ) : (
            <Text className="text-sm">{coverageSummary(draft.countries)}</Text>
          )}

          <SaveFailure title="Could not save this region" message={failure} />

          <FormSection title="The region">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    placeholder="United States"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>
                  A name only you see, to tell your regions apart.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Deliver anywhere in the world</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={everywhere}
                    onCheckedChange={(next: boolean) => {
                      set('countries', next ? [] : draft.countries);
                    }}
                  />
                }
              />
              <FieldDescription>
                Leave on to reach every country. Turn it off to deliver only to the countries you
                choose.
              </FieldDescription>
            </Field>

            {everywhere ? null : (
              <Field>
                <FieldLabel>Countries you deliver to</FieldLabel>
                <FieldControl
                  render={
                    <Select
                      multiple
                      color="module"
                      aria-label="Countries you deliver to"
                      placeholder="Choose one or more countries…"
                      items={countryOptions()}
                      value={draft.countries}
                      onValueChange={(next) => {
                        set('countries', (next as string[]) ?? []);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Start typing to find a country. Choose none and this region reaches everywhere.
                </FieldDescription>
              </Field>
            )}

            <Field>
              <FieldLabel>Priority when regions overlap</FieldLabel>
              <FieldControl
                render={
                  <NumberField
                    label="Priority when regions overlap"
                    className="max-w-[10rem]"
                    min={0}
                    value={draft.priority}
                    onValueChange={(next) => {
                      set('priority', typeof next === 'number' && !Number.isNaN(next) ? next : 0);
                    }}
                  />
                }
              />
              <FieldDescription>
                If a shopper&apos;s address fits more than one region, the region with the higher
                number is used. Leave at 0 unless your regions overlap.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Delivery options"
            description="Each option is one choice a shopper here can pick at checkout, with the price you set. Add as many as you like — a fixed price, free over a certain order value, and so on."
          >
            {isNew ? (
              <Text className="text-sm">
                Create this region first (use Save above), then its delivery options can be added
                here.
              </Text>
            ) : (
              <ZoneRatesEditor zoneId={id} />
            )}
          </FormSection>

          {!isNew && zone ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting removes this region and every delivery option in it.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                loading={remove.isPending}
                onClick={() => {
                  void onDelete();
                }}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                Delete this region
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
