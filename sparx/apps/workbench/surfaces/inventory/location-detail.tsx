'use client';

// ONE LOCATION — set it up, change it, close it, or archive it.
//
// ── Create and edit are the SAME surface ─────────────────────────────────
//
// A new location and an existing one are the same object at two ages, and the
// form is the same either way — a warehouse needs a name, a code and an address
// to exist at all, so there is no leaner "create" shape to split off. So this is
// ONE pane in two states: `{id:'new'}` renders a blank draft, `{id}` renders the
// same fields hydrated. Splitting them is how a field ends up owned by two
// components at once.
//
// ── Not EditorLayout ─────────────────────────────────────────────────────
//
// A name, a code, a kind and an address is a form, but there is no running
// summary to put beside it — a summary rail here would float half-empty next to
// the fields. One centred, capped column instead.
//
// ── Closing vs archiving ─────────────────────────────────────────────────
//
// Two different retirements, kept apart. CLOSING a location (the "In use"
// switch) keeps it in the list but takes no new stock — a shop shut for the
// winter. ARCHIVING removes it entirely, and the server refuses while any stock
// remains. Archive is rare and hard to undo, so it sits at the bottom under a
// divider, after the work, not as a card competing with the fields.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
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
import { useConfirm } from '../../lib/confirm';
import { Archive, MapPin, Save, Warehouse } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  LOCATION_TYPES,
  conflictField,
  isNotFound,
  locationErrorMessage,
  locationPlace,
  locationState,
  locationTypeHint,
  useArchiveLocation,
  useCreateLocation,
  useLocation,
  useUpdateLocation,
  type Location,
  type LocationAddressInput,
} from './locations-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** Centred and capped — a pane torn onto a second monitor is 2000px wide, and
 *  uncapped this becomes fields pinned to the left edge. */
const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

/** The editable state of the form. Everything a string so an empty field is
 *  empty rather than a stray zero or null. */
interface Draft {
  name: string;
  code: string;
  type: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  isActive: boolean;
}

const BLANK: Draft = {
  name: '',
  code: '',
  type: 'owned',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  phone: '',
  isActive: true,
};

/** A code is uppercase letters, digits, dash and underscore — matching what the
 *  server accepts — so we shape it as it is typed rather than rejecting it after. */
function cleanCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 15);
}

/** A country is a two-letter code (US, GB, DE). Upper-cased and clamped as typed. */
function cleanCountry(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
}

function draftFrom(location: Location): Draft {
  return {
    name: location.name,
    code: location.code,
    type: location.type,
    line1: location.line1 ?? '',
    line2: location.line2 ?? '',
    city: location.city ?? '',
    region: location.region ?? '',
    postalCode: location.postalCode ?? '',
    country: location.country ?? '',
    phone: location.phone ?? '',
    isActive: location.isActive,
  };
}

/** The optional address parts, omitting the blanks so the server stores a null
 *  rather than an empty string. */
function addressInput(draft: Draft): LocationAddressInput {
  return {
    line1: draft.line1.trim(),
    city: draft.city.trim(),
    country: draft.country.trim(),
    ...(draft.line2.trim() ? { line2: draft.line2.trim() } : {}),
    ...(draft.region.trim() ? { region: draft.region.trim() } : {}),
    ...(draft.postalCode.trim() ? { postalCode: draft.postalCode.trim() } : {}),
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
  };
}

/** Which address fields differ from what was loaded — an update sends the whole
 *  address or none of it, so it only sends it when one of these actually moved. */
function addressChanged(draft: Draft, initial: Draft): boolean {
  return (
    draft.line1 !== initial.line1 ||
    draft.line2 !== initial.line2 ||
    draft.city !== initial.city ||
    draft.region !== initial.region ||
    draft.postalCode !== initial.postalCode ||
    draft.country !== initial.country ||
    draft.phone !== initial.phone
  );
}

/* ── The shared form ────────────────────────────────────────────────────── */

function LocationEditor({
  ctx,
  id,
  initial,
  existing,
}: {
  ctx: SurfaceContext;
  /** 'new' or a real id. */
  id: string;
  /** The starting draft — blank for a new location, hydrated for one that exists. */
  initial: Draft;
  /** The loaded row, when editing — drives the identity header and archive. */
  existing: Location | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === 'new';

  const create = useCreateLocation();
  const update = useUpdateLocation(id);
  const archive = useArchiveLocation(id);

  const [draft, setDraft] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    ctx.setTitle(isNew ? 'New location' : draft.name.trim() || 'Location');
  }, [ctx, isNew, draft.name]);

  const nameOk = draft.name.trim() !== '';
  const codeOk = draft.code.trim() !== '';
  const addrTouched = isNew || addressChanged(draft, initial);
  const addrOk =
    draft.line1.trim() !== '' &&
    draft.city.trim() !== '' &&
    /^[A-Z]{2}$/.test(draft.country.trim());
  // The address is required to CREATE, and required once any of its fields is
  // touched on an EDIT — but an untouched edit (a rename) needs no address.
  const addrRequired = isNew || addrTouched;
  const addrValid = !addrRequired || addrOk;
  // Show the "needs a little more" note once the person has engaged the form —
  // on a new location that is the moment they name it or touch an address field,
  // so a disabled Create button always has a reason on screen next to it.
  const anyAddressTyped = Boolean(draft.line1.trim() || draft.city.trim() || draft.country.trim());
  const showAddrWarning =
    addrRequired && !addrOk && (isNew ? nameOk || codeOk || anyAddressTyped : true);

  const changed = useMemo(() => {
    if (isNew) {
      return (
        draft.name.trim() !== '' ||
        draft.code.trim() !== '' ||
        addressChanged(draft, BLANK) ||
        draft.type !== BLANK.type
      );
    }
    return (
      draft.name !== initial.name ||
      draft.code !== initial.code ||
      draft.type !== initial.type ||
      draft.isActive !== initial.isActive ||
      addressChanged(draft, initial)
    );
  }, [draft, initial, isNew]);

  const busy = create.isPending || update.isPending;
  const canSave = nameOk && codeOk && addrValid && changed && !busy;

  useDirtySource(
    changed && !create.isSuccess,
    isNew
      ? 'This new location has not been saved yet. Close anyway?'
      : `${initial.name || 'This location'} has unsaved changes. Close anyway?`
  );

  // The code-in-use conflict belongs under the code box, not in a banner.
  const codeConflict =
    (create.isError && conflictField(create.error) === 'code') ||
    (update.isError && conflictField(update.error) === 'code');
  const codeError = codeConflict ? 'A location is already using that code. Pick another.' : null;

  // ONE banner, the most specific one — and never for the code conflict, which
  // has its own message under the field.
  const saveError =
    (create.isError && !codeConflict) || (update.isError && !codeConflict)
      ? locationErrorMessage(
          create.error ?? update.error,
          'Nothing was saved. Try again in a moment.'
        )
      : null;

  const submit = () => {
    if (!canSave) return;

    if (isNew) {
      create.mutate(
        {
          name: draft.name.trim(),
          code: draft.code.trim(),
          type: draft.type,
          address: addressInput(draft),
          isActive: draft.isActive,
        },
        {
          onSuccess: (result) => {
            // Becomes the manage view for the location that now exists, rather
            // than a spent form beside a list that has moved on. Toast follows
            // the swap rather than sharing its commit — see afterPaneChange.
            ctx.open('inventory.warehouses.detail', { id: result.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({ title: `${draft.name.trim()} added`, type: 'success' });
            });
          },
        }
      );
      return;
    }

    update.mutate(
      {
        ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
        ...(draft.code !== initial.code ? { code: draft.code.trim() } : {}),
        ...(draft.type !== initial.type ? { type: draft.type } : {}),
        ...(draft.isActive !== initial.isActive ? { isActive: draft.isActive } : {}),
        ...(addressChanged(draft, initial) ? { address: addressInput(draft) } : {}),
      },
      {
        onSuccess: () => {
          toast.add({ title: 'Location saved', type: 'success' });
        },
      }
    );
  };

  const onArchive = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Archive ${existing.name}?`,
      description:
        'This removes it from your locations. Its past movements are kept, but you will not be able to send stock here or count against it. A location can only be archived once it holds no stock.',
      confirmLabel: 'Archive this location',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${existing.name} archived`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not archive this location',
          // The server names the real reason ("still holds stock…"); show it.
          description: locationErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const place = existing ? locationPlace(existing) : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={isNew ? 'New location actions' : 'Location actions'}
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
            {isNew ? 'Create location' : 'Save'}
          </Button>
        }
        controls={
          <>
            {existing ? (
              <Badge color={locationState(existing).tone} variant="soft" size="sm">
                {locationState(existing).label}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* On an existing location the pane opens by saying WHAT it is — its
              name, the code on its shelf labels, and where it is. A new one is
              introduced by the form section below instead. */}
          {existing ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
                <Warehouse className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{existing.name}</span>
              </Heading>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-sm">{existing.code}</span>
                {place ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      <Text as="span" className="text-sm">
                        {place}
                      </Text>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <SaveFailure title="Could not save this location" message={saveError} />

          <FormSection
            title={isNew ? 'New location' : 'Name and kind'}
            description={
              isNew
                ? 'A location is any place you keep stock. Give it a name, a short code for your shelves and paperwork, and say what kind of place it is.'
                : undefined
            }
          >
            <Field>
              <FieldLabel>Location name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    placeholder="Riverside Warehouse"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>What you call this place day to day.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Short code</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={codeError ? 'error' : 'module'}
                    value={draft.code}
                    placeholder="RIV"
                    className="max-w-40 font-mono"
                    onChange={(event) => {
                      set('code', cleanCode(event.target.value));
                    }}
                  />
                }
              />
              {codeError ? (
                <FieldStatus status="error">{codeError}</FieldStatus>
              ) : (
                <FieldDescription>
                  A short label for this place, printed on shelf tickets and paperwork — letters,
                  numbers and dashes, up to fifteen. It must be different from your other locations.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>What kind of place</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={draft.type}
                    aria-label="What kind of place"
                    onChange={(event) => {
                      set('type', event.target.value);
                    }}
                  >
                    {LOCATION_TYPES.map((kind) => (
                      <option key={kind.value} value={kind.value}>
                        {kind.label}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              <FieldDescription>{locationTypeHint(draft.type)}</FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Where it is"
            description="The address stock lives at. It appears on paperwork and helps work out shipping. A place that keeps no physical stock — like a supplier that ships direct — can leave most of this blank."
          >
            <Field>
              <FieldLabel>Street address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.line1}
                    placeholder="14 Mill Lane"
                    onChange={(event) => {
                      set('line1', event.target.value);
                    }}
                  />
                }
              />
            </Field>

            <Field>
              <FieldLabel>Unit, suite or floor (optional)</FieldLabel>
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

            <div className="grid gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>Town or city</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.city}
                      placeholder="Bristol"
                      onChange={(event) => {
                        set('city', event.target.value);
                      }}
                    />
                  }
                />
              </Field>

              <Field>
                <FieldLabel>County, state or region (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.region}
                      placeholder="Somerset"
                      onChange={(event) => {
                        set('region', event.target.value);
                      }}
                    />
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Postcode or ZIP (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.postalCode}
                      placeholder="BS1 4RW"
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
                      placeholder="GB"
                      className="max-w-24 font-mono uppercase"
                      onChange={(event) => {
                        set('country', cleanCountry(event.target.value));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  The two-letter country code — GB for the United Kingdom, US for the United States,
                  DE for Germany.
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel>Phone (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.phone}
                    placeholder="+44 117 496 0000"
                    onChange={(event) => {
                      set('phone', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                A number for this place, in case a delivery or a courier needs it.
              </FieldDescription>
            </Field>

            {/* Names exactly what is missing, only once the address is required
                but not yet complete — a rename never triggers this. */}
            {showAddrWarning ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>The address needs a little more</AlertTitle>
                  <AlertDescription>
                    A street address, a town or city, and a two-letter country code are needed
                    before this can be saved.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </FormSection>

          {/* Closing keeps the location; archiving removes it. Both are quiet,
              deliberate rows after the work rather than cards competing with the
              fields someone came to change. */}
          <div className="border-base-300 flex flex-col gap-4 border-t pt-4">
            <label className="flex items-start gap-3">
              <Checkbox
                color="module"
                checked={draft.isActive}
                aria-label="This location is in use"
                onChange={(event) => {
                  set('isActive', event.target.checked);
                }}
              />
              <span className="flex flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  This location is in use
                </Text>
                <Text as="span" className="text-sm">
                  Switch this off to close the location without removing it — it keeps its history
                  but takes no new stock, and disappears from the everyday list. Turn it back on any
                  time.
                </Text>
              </span>
            </label>

            {existing ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Archiving removes this location for good. Its past movements are kept. You can
                  only archive a location once it holds no stock.
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  disabled={archive.isPending}
                  onClick={() => {
                    void onArchive();
                  }}
                >
                  <Archive className="size-4" aria-hidden />
                  {archive.isPending ? 'Archiving…' : 'Archive'}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function LocationDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';
  const location = useLocation(id);

  if (isNew) {
    return <LocationEditor ctx={ctx} id="new" initial={BLANK} existing={null} />;
  }

  // A failed load REPLACES the form — never an empty form beside a dead Save,
  // which invites editing a location you cannot see.
  if (location.isError) {
    const gone = isNotFound(location.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This location no longer exists' : 'Could not load this location'}
          description={
            gone
              ? 'It has been archived or removed. Its past stock movements are unaffected.'
              : 'This is a problem reaching the server. Nothing about the location has changed.'
          }
          onRetry={() => {
            void location.refetch();
          }}
        />
      </div>
    );
  }

  if (location.isPending || !location.data) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // `key` on the id remounts the editor when the pane is pointed at a different
  // location, so the draft is re-seeded from the new row rather than kept from
  // the last one — the "replace" hop after create relies on this.
  return (
    <LocationEditor
      key={location.data.id}
      ctx={ctx}
      id={id}
      initial={draftFrom(location.data)}
      existing={location.data}
    />
  );
}
