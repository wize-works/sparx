'use client';

// One place you collect tax — create it, then manage its rate(s).
//
// WHERE the place is (its country, and optionally one state or province) is
// chosen once when you create it and fixed after, exactly like a collection's
// kind: moving a zone somewhere else is really a different zone, and the tax
// engine keys refunds off the original. To move it, delete and make a new one.
// Everything else — why you collect here, your registration number, whether it
// is switched on, and the rate itself — stays editable.
//
// A place with no rate, or one switched off, charges nothing: the calculator
// only ever matches an ACTIVE place with a rate. So an off/rate-less place is
// safe, and the surface says as much rather than implying tax is being charged.
//
// SWITCHING ON IS THE ONE THING HERE THAT MOVES MONEY, so it is the one thing
// only a person may do. An industry starter once set three US states collecting
// for a Denver studio that had never traded outside Colorado (issue 429), and
// `isActive` on its own could not tell that apart from a decision the owner had
// made. The server stamps `activatedAt` when a signed-in person turns a place
// on, refuses to activate for anything else, and a database CHECK backs it up.
// This pane reads `zoneIsCollecting` rather than the switch, so what it says and
// what the till does cannot drift apart.

import { useEffect, useMemo, useState } from 'react';
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
  Heading,
  Input,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Plus, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { countryName, countryOptions, hasRegions, regionName, regionOptions } from './geo';
import { SaveFailure } from '@/components/save-failure';
import {
  formatBasisPoints,
  formatDay,
  nexusLabel,
  percentToBasisPoints,
  taxErrorMessage,
  useCreateTaxRate,
  useCreateTaxZone,
  useDeleteTaxRate,
  useDeleteTaxZone,
  useTaxZone,
  useUpdateTaxZone,
  useZoneTaxRates,
  zoneIsCollecting,
  type NexusType,
  type TaxRate,
  type TaxZone,
} from './tax-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const NEXUS_OPTIONS: { value: NexusType; label: string }[] = [
  { value: 'physical', label: 'You have a shop, office, or staff here' },
  { value: 'economic', label: 'You sell enough here to owe tax' },
  { value: 'voluntary', label: 'You chose to collect here' },
];

interface Draft {
  country: string;
  region: string; // '' = the whole country
  nexusType: NexusType;
  registrationNumber: string;
  isActive: boolean;
}

function toDraft(zone: TaxZone): Draft {
  return {
    country: zone.country,
    region: zone.region ?? '',
    nexusType: (zone.nexusType as NexusType) ?? 'physical',
    registrationNumber: zone.registrationNumber ?? '',
    isActive: zone.isActive,
  };
}

// A NEW PLACE STARTS OFF. The line above the form has always said "Nothing is
// charged until you switch the place on", and with the switch pre-set to on it
// was not true. Set the place up, put the rate in, look at it, then switch it
// on: that is the order the copy describes and the only one that cannot start
// charging a shopper for something nobody checked.
function emptyDraft(): Draft {
  return {
    country: 'US',
    region: '',
    nexusType: 'physical',
    registrationNumber: '',
    isActive: false,
  };
}

export function TaxZoneDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <ZoneEditor ctx={ctx} id="new" /> : <ZoneLoader ctx={ctx} id={id} />;
}

function ZoneLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: zone, isPending, isError, error, refetch } = useTaxZone(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="tax place"
        title="Could not load this tax place"
        description="This is a problem reaching the server. Nothing has been lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !zone) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <ZoneEditor ctx={ctx} id={id} zone={zone} />;
}

function ZoneEditor({ ctx, id, zone }: { ctx: SurfaceContext; id: string; zone?: TaxZone }) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateTaxZone();
  const update = useUpdateTaxZone(id);
  const remove = useDeleteTaxZone(id);

  // What the till would actually do, not what the switch says.
  const collecting = zone ? zoneIsCollecting(zone) : false;
  const chargingSince = collecting && zone ? formatDay(zone.activatedAt) : null;

  const saved = useMemo(() => (zone ? toDraft(zone) : emptyDraft()), [zone]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const placeTitle = draft.region ? regionName(draft.region) : countryName(draft.country);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New tax place' : placeTitle || 'Tax place');
  }, [ctx, isNew, placeTitle]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = isNew
    ? true
    : draft.nexusType !== saved.nexusType ||
      draft.registrationNumber !== saved.registrationNumber ||
      draft.isActive !== saved.isActive;

  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess && (isNew || touched),
    isNew
      ? 'This tax place has not been created yet. Close anyway?'
      : 'This tax place has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError
      ? taxErrorMessage(
          create.error ?? update.error,
          'Could not save this place. Nothing was changed.'
        )
      : null;

  const submit = () => {
    const input = {
      country: draft.country,
      ...(draft.region ? { region: draft.region } : {}),
      nexusType: draft.nexusType,
      registrationNumber: draft.registrationNumber.trim(),
      isActive: draft.isActive,
    };
    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('commerce.tax.zone.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${placeTitle} added`, type: 'success' });
          });
        },
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Tax place saved', type: 'success' });
      },
    });
  };

  const onDelete = async () => {
    if (!zone) return;
    const ok = await confirm({
      title: `Delete ${placeTitle}?`,
      description:
        'This place and its rate are removed, and you will stop collecting tax here at checkout. This cannot be undone.',
      confirmLabel: 'Delete this place',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${placeTitle} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this place',
          description: taxErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const showRegions = hasRegions(draft.country);
  const regionItems = [{ value: '', label: 'The whole country' }, ...regionOptions(draft.country)];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Tax place actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={!isNew && !dirty}
            onClick={submit}
          >
            {isNew ? 'Add this place' : 'Save'}
          </Button>
        }
        controls={
          <>
            {!isNew && zone ? (
              <Badge color={collecting ? 'success' : 'neutral'} variant="soft" size="sm">
                {collecting ? 'Collecting' : 'Off'}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Add a tax place
              </Heading>
              <Text>
                Set up somewhere you have to collect tax. Choose the country (and a state or
                province if the tax is set there), then add the rate. It starts switched off, so
                nothing is charged here until you come back and switch it on yourself.
              </Text>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                {placeTitle}
              </Heading>
              <Text className="text-sm">
                {/* Why she collects here is only worth saying once she DOES. On a
                    place charging nothing, "You have a shop, office, or staff
                    here" is the screen asserting a fact about her business that
                    nobody asked her, which is the whole of issue 429. The LIST row
                    was fixed and this one was missed, and it showed: a Colorado
                    place created seconds earlier, switched off, still claimed a
                    presence. Reads the SAVED zone, not the draft, so it describes
                    what is true now rather than what an unsaved switch intends. */}
                {draft.region ? `${countryName(draft.country)} · ` : ''}
                {collecting ? nexusLabel(draft.nexusType) : 'Nothing is charged here yet'}
              </Text>
            </div>
          )}

          <SaveFailure title="Could not save this place" message={failure} />

          {isNew ? (
            <FormSection
              title="Where"
              description="This is fixed once the place is created — to move it later, delete it and add a new one."
            >
              <Field>
                <FieldLabel>Country</FieldLabel>
                <FieldControl
                  render={
                    <Select
                      color="module"
                      aria-label="Country"
                      value={draft.country}
                      items={countryOptions()}
                      onValueChange={(next) => {
                        const country = (next as string) ?? 'US';
                        setTouched(true);
                        setDraft((current) => ({ ...current, country, region: '' }));
                      }}
                    />
                  }
                />
              </Field>

              {showRegions ? (
                <Field>
                  <FieldLabel>State or province</FieldLabel>
                  <FieldControl
                    render={
                      <Select
                        color="module"
                        aria-label="State or province"
                        value={draft.region}
                        items={regionItems}
                        onValueChange={(next) => {
                          set('region', (next as string) ?? '');
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    Choose a state or province if the tax is set there. Leave as the whole country
                    for a nationwide tax.
                  </FieldDescription>
                </Field>
              ) : null}
            </FormSection>
          ) : null}

          <FormSection title="About this place">
            <Field>
              <FieldLabel>Why you collect tax here</FieldLabel>
              <FieldControl
                render={
                  <Select
                    color="module"
                    aria-label="Why you collect tax here"
                    value={draft.nexusType}
                    items={NEXUS_OPTIONS}
                    onValueChange={(next) => {
                      set('nexusType', (next as NexusType) ?? 'physical');
                    }}
                  />
                }
              />
              <FieldDescription>
                For your own records. It doesn&apos;t change what a shopper is charged.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Registration or permit number (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.registrationNumber}
                    placeholder="e.g. your sales-tax permit or VAT number"
                    onChange={(event) => {
                      set('registrationNumber', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Your own record of what lets you collect here. Shoppers never see it, and it does
                not change what they are charged.
              </FieldDescription>
            </Field>

            {/* Not offered while adding. A place is always created switched off
                and starting to collect is a separate act, both because it is the
                honest order of work (add it, put the rate in, look at it, then
                switch it on) and because a switch nothing but a person can reach
                is what keeps a starter from setting a shop collecting in three
                states nobody chose. The server refuses it too. */}
            {isNew ? null : (
              <Field>
                <FieldLabel>Collect tax here</FieldLabel>
                <FieldControl
                  render={
                    <Switch
                      color="module"
                      checked={draft.isActive}
                      onCheckedChange={(next: boolean) => {
                        set('isActive', next);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  {chargingSince
                    ? `Charging here since ${chargingSince}. Switch it off and nothing more is charged, whatever rate is set below.`
                    : 'While this is off, nothing is charged here, whatever rate is set below. Only you can switch it on, and the day you do is kept on the record.'}
                </FieldDescription>
              </Field>
            )}
          </FormSection>

          <FormSection
            title="The rate"
            description="What percentage is added. You can add more than one (a state and a county tax, say) and they add together."
          >
            {isNew ? (
              <Text className="text-sm">
                Add this place first (use Add above), then set its rate here.
              </Text>
            ) : (
              <ZoneTaxRatesEditor zoneId={id} />
            )}
          </FormSection>

          {!isNew && zone ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">Deleting stops you collecting tax here.</Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                loading={remove.isPending}
                onClick={() => {
                  void onDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete this place
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Rates ──────────────────────────────────────────────────────────────── */

function ZoneTaxRatesEditor({ zoneId }: { zoneId: string }) {
  const rates = useZoneTaxRates(zoneId);
  const create = useCreateTaxRate();
  const remove = useDeleteTaxRate();
  const confirm = useConfirm();
  const toast = useToast();

  const [name, setName] = useState('');
  const [percent, setPercent] = useState('');
  const [appliesToShipping, setAppliesToShipping] = useState(false);

  const rows = rates.data ?? [];
  const percentValue = Number(percent);
  const percentValid =
    percent.trim() !== '' &&
    Number.isFinite(percentValue) &&
    percentValue >= 0 &&
    percentValue <= 100;
  const canAdd = name.trim() !== '' && percentValid;

  const failure = create.isError
    ? taxErrorMessage(create.error, 'Could not add this rate. Nothing was changed.')
    : null;

  const add = () => {
    if (!canAdd) return;
    create.mutate(
      {
        zoneId,
        name: name.trim(),
        rateBasisPoints: percentToBasisPoints(percentValue),
        appliesToShipping,
      },
      {
        onSuccess: () => {
          setName('');
          setPercent('');
          setAppliesToShipping(false);
          toast.add({ title: 'Rate added', type: 'success' });
        },
      }
    );
  };

  const onDelete = (rate: TaxRate) => {
    void (async () => {
      const ok = await confirm({
        title: `Remove ${rate.name}?`,
        description: `The ${formatBasisPoints(rate.rateBasisPoints)} rate is removed from this place. This cannot be undone.`,
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
            title: 'Could not remove that rate',
            description: taxErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  return (
    <div className="flex flex-col gap-4">
      {rates.isError ? (
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not load the rate</AlertTitle>
            <AlertDescription>
              {taxErrorMessage(rates.error, 'This is a problem reaching the server.')}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : rates.isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : rows.length === 0 ? (
        <Text className="text-sm">
          No rate set yet — nothing is charged here until you add one below.
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
                {rate.appliesToShipping ? (
                  <Text as="span" className="text-sm">
                    Also charged on delivery
                  </Text>
                ) : null}
              </span>
              <Badge color="neutral" variant="soft" size="sm">
                {formatBasisPoints(rate.rateBasisPoints)}
              </Badge>
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
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      <SaveFailure title="Could not add this rate" message={failure} />

      <div className="border-base-300 bg-base-200 flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel>Rate name</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={name}
                  placeholder="e.g. California Sales Tax"
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              }
            />
          </Field>
          <Field className="min-w-[8rem]">
            <FieldLabel>Percentage</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  className="max-w-[7rem] text-right tabular-nums"
                  inputMode="decimal"
                  value={percent}
                  placeholder="8.25"
                  onChange={(event) => {
                    setPercent(event.target.value.replace(/[^0-9.]/g, ''));
                  }}
                />
              }
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Also charge this tax on delivery</FieldLabel>
          <FieldControl
            render={
              <Switch
                color="module"
                checked={appliesToShipping}
                onCheckedChange={(next: boolean) => {
                  setAppliesToShipping(next);
                }}
              />
            }
          />
          <FieldDescription>
            Some places tax the delivery charge too. Leave off if unsure.
          </FieldDescription>
        </Field>

        <div className="flex justify-end">
          <Button
            size="sm"
            color="module"
            loading={create.isPending}
            disabled={!canAdd}
            onClick={add}
          >
            <Plus className="size-4" aria-hidden />
            Add this rate
          </Button>
        </div>
      </div>
    </div>
  );
}
