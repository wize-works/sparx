'use client';

// ONE PLACE — create it, then everything about it.
//
// Create and manage are the same surface: `{ id: 'new' }` builds it, `{ id }`
// manages it, so the form is written once.
//
// The one thing this surface has to make obvious is the difference between
// SWITCHING OFF and REMOVING. Switching off retires a place while every past
// booking keeps its history, and it is always available. Removing is refused
// outright while bookings point here — the server answers LOCATION_IN_USE — so
// the form says so BEFORE the owner tries it rather than after.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { MapPin, Save, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { SiteScopeField } from '../../components/site-scope-field';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useBusinessTimezone } from '../../lib/business-timezone';
import { SaveFailure } from '@/components/save-failure';
import {
  TIMEZONE_OPTIONS,
  isNotFound,
  schedulingErrorMessage,
  useCreateLocation,
  useDeleteLocation,
  useLocation,
  useUpdateLocation,
  type BusinessLocation,
  type LocationInput,
} from './setup-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';
const DETAIL_KEY = 'scheduling.locations.detail';

interface Draft {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  timezone: string;
  /** Strings so an empty coordinate field is empty, not a zero on the equator. */
  lat: string;
  lng: string;
  isActive: boolean;
  /** The sites served from here. EMPTY = all of them. */
  propertyIds: string[];
}

const BLANK: Draft = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  timezone: 'UTC',
  lat: '',
  lng: '',
  isActive: true,
  propertyIds: [],
};

function draftFrom(location: BusinessLocation): Draft {
  return {
    name: location.name,
    line1: location.address.line1 ?? '',
    line2: location.address.line2 ?? '',
    city: location.address.city ?? '',
    region: location.address.region ?? '',
    postalCode: location.address.postalCode ?? '',
    country: location.address.country ?? '',
    timezone: location.timezone,
    lat: location.lat == null ? '' : String(location.lat),
    lng: location.lng == null ? '' : String(location.lng),
    isActive: location.isActive,
    // Sorted so the dirty check (a JSON compare) can't fire on ordering alone.
    propertyIds: [...location.propertyIds].sort(),
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A coordinate field is valid empty, or a real number in range. Returned
 *  separately from the value so the form can explain WHICH half is wrong. */
function coordinate(value: string, bound: number): { ok: boolean; value: number | null } {
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < -bound || parsed > bound)
    return { ok: false, value: null };
  return { ok: true, value: parsed };
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function LocationDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const businessZone = useBusinessTimezone();

  if (id !== 'new') return <LocationLoader ctx={ctx} id={id} />;

  // Held until the zone resolves rather than stamped with a placeholder the
  // person would have to notice and undo. A cached read, so one frame.
  if (businessZone === undefined) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return (
    <LocationEditor
      ctx={ctx}
      id="new"
      initial={{ ...BLANK, timezone: businessZone }}
      existing={null}
    />
  );
}

function LocationLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data, isPending, isError, error, refetch } = useLocation(id);

  if (isError) {
    const missing = isNotFound(error);
    return (
      <PaneLoadError
        reason={missing ? 'missing' : 'unreachable'}
        title={missing ? 'This place is gone' : 'Could not load this place'}
        description={
          missing
            ? 'It was removed, or the link is out of date.'
            : 'This is a problem reaching the server. The place itself is unaffected — nothing has been lost.'
        }
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !data) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <LocationEditor ctx={ctx} id={id} initial={draftFrom(data)} existing={data} />;
}

function LocationEditor({
  ctx,
  id,
  initial,
  existing,
}: {
  ctx: SurfaceContext;
  id: string;
  initial: Draft;
  existing: BusinessLocation | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === 'new';

  const create = useCreateLocation();
  const update = useUpdateLocation(id);
  const remove = useDeleteLocation(id);

  const [draft, setDraft] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    ctx.setTitle(isNew ? 'New place' : draft.name.trim() || 'Place');
  }, [ctx, isNew, draft.name]);

  const nameOk = draft.name.trim() !== '';
  const lat = coordinate(draft.lat, 90);
  const lng = coordinate(draft.lng, 180);
  // Both halves or neither — the server refuses half a coordinate, so say it here.
  const coordinatesPaired = (lat.value === null) === (lng.value === null);
  const coordinateError = !lat.ok
    ? 'A latitude is a number between -90 and 90.'
    : !lng.ok
      ? 'A longitude is a number between -180 and 180.'
      : coordinatesPaired
        ? null
        : 'Fill in both the latitude and the longitude, or leave both empty.';

  const changed = useMemo(() => !draftsEqual(draft, initial), [draft, initial]);
  const busy = create.isPending || update.isPending;
  const canSave = nameOk && coordinateError === null && changed && !busy;

  useDirtySource(
    changed && !create.isSuccess,
    isNew
      ? 'This new place has not been saved yet. Close anyway?'
      : `${initial.name || 'This place'} has unsaved changes. Close anyway?`
  );

  const saveError =
    create.isError || update.isError
      ? schedulingErrorMessage(
          create.error ?? update.error,
          'Nothing was saved. Try again in a moment.'
        )
      : null;

  const payload = (): LocationInput => ({
    name: draft.name.trim(),
    address: {
      ...(draft.line1.trim() ? { line1: draft.line1.trim() } : {}),
      ...(draft.line2.trim() ? { line2: draft.line2.trim() } : {}),
      ...(draft.city.trim() ? { city: draft.city.trim() } : {}),
      ...(draft.region.trim() ? { region: draft.region.trim() } : {}),
      ...(draft.postalCode.trim() ? { postalCode: draft.postalCode.trim() } : {}),
      ...(draft.country.trim() ? { country: draft.country.trim() } : {}),
    },
    timezone: draft.timezone,
    lat: lat.value,
    lng: lng.value,
    isActive: draft.isActive,
    propertyIds: draft.propertyIds,
  });

  const submit = () => {
    if (!canSave) return;
    const body = payload();
    if (isNew) {
      create.mutate(body, {
        onSuccess: (row) => {
          ctx.open(DETAIL_KEY, { id: row.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${body.name ?? 'Place'} added`, type: 'success' });
          });
        },
      });
      return;
    }
    update.mutate(body, {
      onSuccess: () => {
        toast.add({ title: 'Saved', type: 'success' });
      },
    });
  };

  const bookings = existing?.counts.bookings ?? 0;
  const filedElsewhere = (existing?.counts.resources ?? 0) + (existing?.counts.services ?? 0);

  const onRemove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Remove ${existing.name}?`,
      description:
        filedElsewhere > 0
          ? `${String(filedElsewhere)} of your people, things and services are filed here. They are kept, but they stop being tied to a place until you re-file them. This cannot be undone.`
          : 'This takes the place off your list. This cannot be undone.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${existing.name} removed`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this',
          description: schedulingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={isNew ? 'New place actions' : 'Place actions'}
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={busy}
            onClick={submit}
          >
            <Save className="size-4" aria-hidden />
            {isNew ? 'Create' : 'Save'}
          </Button>
        }
        controls={
          <>
            {existing ? (
              <Badge color={existing.isActive ? 'success' : 'neutral'} variant="soft" size="sm">
                {existing.isActive ? 'In use' : 'Off'}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {existing ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
                <MapPin className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{existing.name}</span>
              </Heading>
              <Text className="text-sm">
                {existing.counts.resources} people &amp; things · {existing.counts.services}{' '}
                services · {existing.counts.bookings} bookings
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this" message={saveError} />

          <FormSection
            title={isNew ? 'The new place' : 'What it is called'}
            description={
              isNew
                ? 'Name the premises you serve customers from. Your people, services and bookings are each filed against one.'
                : undefined
            }
          >
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    placeholder="High Street shop"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              {nameOk ? (
                <FieldDescription>What your team calls it.</FieldDescription>
              ) : (
                <FieldStatus status="error">Give the place a name.</FieldStatus>
              )}
            </Field>

            <Field>
              <FieldLabel>Time zone</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    color="module"
                    value={draft.timezone}
                    onChange={(event) => {
                      set('timezone', event.target.value);
                    }}
                  >
                    {(TIMEZONE_OPTIONS as readonly string[]).includes(draft.timezone) ? null : (
                      <option value={draft.timezone}>{draft.timezone}</option>
                    )}
                    {TIMEZONE_OPTIONS.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              <FieldDescription>
                The zone this place is in. Each person&rsquo;s working hours are read in their own
                zone, so this is what a customer is shown.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Where it is"
            description="Shown to customers on your booking page. Fill in as much as makes sense — a market stall and a clinic do not need the same lines."
          >
            <Field>
              <FieldLabel>Street</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.line1}
                    placeholder="14 High Street"
                    onChange={(event) => {
                      set('line1', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Unit, floor or suite (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.line2}
                    placeholder="Unit 3"
                    onChange={(event) => {
                      set('line2', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Town or city</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.city}
                      onChange={(event) => {
                        set('city', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>State, county or region</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.region}
                      onChange={(event) => {
                        set('region', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Postal code</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.postalCode}
                      onChange={(event) => {
                        set('postalCode', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Country</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.country}
                      onChange={(event) => {
                        set('country', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>

            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Latitude (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      inputMode="decimal"
                      value={draft.lat}
                      placeholder="51.5072"
                      onChange={(event) => {
                        set('lat', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Longitude (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      inputMode="decimal"
                      value={draft.lng}
                      placeholder="-0.1276"
                      onChange={(event) => {
                        set('lng', event.target.value);
                      }}
                    />
                  }
                />
                {coordinateError ? (
                  <FieldStatus status="error">{coordinateError}</FieldStatus>
                ) : (
                  <FieldDescription>
                    Used to drop a map pin. Leave both empty to skip.
                  </FieldDescription>
                )}
              </Field>
            </div>
          </FormSection>

          <SiteScopeField
            value={draft.propertyIds}
            onChange={(next) => {
              set('propertyIds', next);
            }}
            title="Which of your businesses serve from here"
            description="You run more than one website. A single premises can host both businesses, or belong to just one."
            everyLabel="Serves every site"
          />

          <div className="border-base-300 flex flex-col gap-4 border-t pt-4">
            <label className="flex items-start gap-3">
              <Checkbox
                color="module"
                checked={draft.isActive}
                aria-label="This place is in use"
                onChange={(event) => {
                  set('isActive', event.target.checked);
                }}
              />
              <span className="flex flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  This place is in use
                </Text>
                <Text as="span" className="text-sm">
                  Switch it off to retire a place you no longer serve from. Everything already
                  booked there keeps its history.
                </Text>
              </span>
            </label>

            {existing ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  {bookings > 0
                    ? `This place is on ${String(bookings)} booking${bookings === 1 ? '' : 's'}, so it cannot be removed — switch it off above instead.`
                    : 'Removing takes this place off your list for good.'}
                </Text>
                <Button
                  color="danger"
                  variant="soft"
                  size="sm"
                  disabled={bookings > 0 || remove.isPending}
                  loading={remove.isPending}
                  onClick={() => {
                    void onRemove();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
