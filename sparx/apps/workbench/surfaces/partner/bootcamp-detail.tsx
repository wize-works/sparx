'use client';

// ONE BOOTCAMP — create it, keep it current, publish it, and retire it.
//
// ── Create and manage are ONE pane ────────────────────────────────────────
// Building a cohort and editing one are the same form, so this is a single
// surface in two states: `{id:'new'}` is it before the bootcamp exists, `{id}`
// after. A separate "new bootcamp" modal would mean writing this form twice and
// could never show a dirty dot or survive a reload.
//
// ── Lifecycle in the header ───────────────────────────────────────────────
// The status and its moves live on the toolbar (Publish / Cancel / Mark finished),
// not in a bespoke in-body status card. Publishing is Certified-only — the server
// enforces it, and a lower-tier host sees why rather than a dead button.
//
// ── Explicit save; delete is a plain row at the end ───────────────────────
// One Save button, last-write-wins, with a leave-guard while there are unsaved
// edits. Deleting is draft-only and hard to reverse, so it sits in a quiet row
// under a divider after the work, never a loud card.

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
  FieldStatus,
  Input,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { RichTextEditor } from '@wizeworks/silicaui-editor';
import { GraduationCap, Rocket, Save, Trash2, XCircle } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  useBootcamp,
  useCreateBootcamp,
  useDeleteBootcamp,
  usePartnerProfile,
  useSetBootcampStatus,
  useUpdateBootcamp,
  isNotFound,
  partnerErrorMessage,
  type Bootcamp,
  type BootcampFormat,
  type BootcampInput,
  type RegistrationMode,
} from './data';
import { bootcampState, BOOTCAMP_FORMATS } from './format';
import { PartnerLoading } from './gate';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const FORMAT_ITEMS: Record<string, string> = Object.fromEntries(
  BOOTCAMP_FORMATS.map((f) => [f.value, f.label])
);
const MODE_ITEMS: Record<string, string> = {
  internal: 'Sign up on sparx (adds a lead to your CRM)',
  external: 'Sign up on my own link',
};

interface FormState {
  title: string;
  description: string;
  format: BootcampFormat;
  locationCity: string;
  locationState: string;
  locationCountry: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: string;
  price: string;
  currency: string;
  registrationMode: RegistrationMode;
  registrationUrl: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  format: 'virtual',
  locationCity: '',
  locationState: '',
  locationCountry: 'US',
  startsAt: '',
  endsAt: '',
  seatsTotal: '',
  price: '',
  currency: 'USD',
  registrationMode: 'internal',
  registrationUrl: '',
};

/** ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input wants, in the
 *  viewer's own timezone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value → an ISO instant, or null if unparseable/blank. */
function fromLocalInput(local: string): string | null {
  if (local.trim() === '') return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formFrom(bootcamp: Bootcamp): FormState {
  return {
    title: bootcamp.title,
    description: bootcamp.description,
    format: bootcamp.format,
    locationCity: bootcamp.locationCity ?? '',
    locationState: bootcamp.locationState ?? '',
    locationCountry: bootcamp.locationCountry,
    startsAt: toLocalInput(bootcamp.startsAt),
    endsAt: toLocalInput(bootcamp.endsAt),
    seatsTotal: bootcamp.seatsTotal === null ? '' : String(bootcamp.seatsTotal),
    price: bootcamp.priceCents === 0 ? '' : (bootcamp.priceCents / 100).toFixed(2),
    currency: bootcamp.currency,
    registrationMode: bootcamp.registrationMode,
    registrationUrl: bootcamp.registrationUrl ?? '',
  };
}

function priceToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function toInput(form: FormState): BootcampInput | null {
  const startsAt = fromLocalInput(form.startsAt);
  const endsAt = fromLocalInput(form.endsAt);
  if (!startsAt || !endsAt) return null;
  const seats = Number.parseInt(form.seatsTotal, 10);
  const needsLocation = form.format === 'in_person' || form.format === 'hybrid';
  return {
    title: form.title.trim(),
    description: form.description,
    format: form.format,
    locationCity: needsLocation && form.locationCity.trim() ? form.locationCity.trim() : null,
    locationState: needsLocation && form.locationState.trim() ? form.locationState.trim() : null,
    locationCountry:
      form.locationCountry.trim().length === 2 ? form.locationCountry.trim().toUpperCase() : 'US',
    startsAt,
    endsAt,
    seatsTotal: Number.isFinite(seats) && seats > 0 ? seats : null,
    priceCents: priceToCents(form.price),
    currency: form.currency.trim() === '' ? 'USD' : form.currency.trim().toUpperCase(),
    registrationMode: form.registrationMode,
    registrationUrl:
      form.registrationMode === 'external' && form.registrationUrl.trim()
        ? form.registrationUrl.trim()
        : null,
  };
}

export function BootcampDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const toast = useToast();
  const confirm = useConfirm();
  const profile = usePartnerProfile();
  const bootcamp = useBootcamp(id);
  const create = useCreateBootcamp();
  const update = useUpdateBootcamp(id);
  const setStatus = useSetBootcampStatus(id);
  const remove = useDeleteBootcamp(id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    if (bootcamp.data && !loaded) {
      const next = formFrom(bootcamp.data);
      setForm(next);
      setBaseline(next);
      setLoaded(true);
    }
  }, [isNew, bootcamp.data, loaded]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New bootcamp' : (bootcamp.data?.title ?? 'Bootcamp'));
  }, [ctx, isNew, bootcamp.data?.title]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

  const startsIso = fromLocalInput(form.startsAt);
  const endsIso = fromLocalInput(form.endsAt);
  const datesOk = startsIso !== null && endsIso !== null && endsIso >= startsIso;
  const titleOk = form.title.trim() !== '';
  const urlOk = form.registrationMode !== 'external' || form.registrationUrl.trim() !== '';
  const canSave = titleOk && datesOk && urlOk && (isNew || dirty);

  useDirtySource(
    dirty && loaded,
    isNew
      ? 'This bootcamp has not been saved yet. Close anyway?'
      : `Changes to ${form.title || 'this bootcamp'} have not been saved. Close anyway?`
  );

  const save = () => {
    if (!canSave) return;
    const input = toInput(form);
    if (!input) return;
    if (isNew) {
      create.mutate(input, {
        onSuccess: (result) => {
          ctx.open('partner.bootcamp.detail', { id: result.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${input.title} saved as a draft`,
              description: 'Publish it when you’re ready to take sign-ups.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not create that bootcamp',
            description: partnerErrorMessage(error, 'Nothing was saved.'),
            type: 'error',
          });
        },
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setBaseline(form);
        afterPaneChange(() => {
          toast.add({ title: `${input.title} saved`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save that bootcamp',
          description: partnerErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const move = (status: Bootcamp['status'], titleWord: string) => {
    setStatus.mutate(status, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({
            title: `${bootcamp.data?.title ?? 'Bootcamp'} ${titleWord}`,
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not change that bootcamp',
          // The server names the exact reason (tier gate), worth showing verbatim.
          description: partnerErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onPublish = async () => {
    const ok = await confirm({
      title: `Publish ${bootcamp.data?.title ?? 'this bootcamp'}?`,
      description:
        'It goes live on the public sparx directory and starts taking sign-ups. You can cancel it later if plans change.',
      confirmLabel: 'Publish it',
      cancelLabel: 'Not yet',
      color: 'module',
    });
    if (ok) move('published', 'published');
  };

  const onCancel = async () => {
    const ok = await confirm({
      title: `Cancel ${bootcamp.data?.title ?? 'this bootcamp'}?`,
      description:
        'It comes off the public directory and stops taking sign-ups. Anyone already registered keeps their place in your records. This can’t be undone.',
      confirmLabel: 'Cancel the bootcamp',
      cancelLabel: 'Keep it running',
      color: 'danger',
    });
    if (ok) move('cancelled', 'cancelled');
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${bootcamp.data?.title ?? 'this draft'}?`,
      description:
        'This draft is removed for good. Only drafts can be deleted, so nothing public is affected.',
      confirmLabel: 'Delete the draft',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${bootcamp.data?.title ?? 'Draft'} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that draft',
          description: partnerErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  // A failed load REPLACES the form — never an empty one beside a dead Save.
  if (!isNew && bootcamp.isError) {
    const gone = isNotFound(bootcamp.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This bootcamp no longer exists' : 'Could not load this bootcamp'}
          description={
            gone
              ? 'It may have been deleted.'
              : 'This is a problem reaching the server. The bootcamp itself is unaffected.'
          }
          onRetry={() => {
            void bootcamp.refetch();
          }}
        />
      </div>
    );
  }

  if (!isNew && (bootcamp.isPending || !loaded)) {
    return <PartnerLoading />;
  }

  const status = bootcamp.data?.status ?? 'draft';
  const state = bootcamp.data ? bootcampState(status) : null;
  const isCertified = profile.data?.tier === 'certified';
  const needsLocation = form.format === 'in_person' || form.format === 'hybrid';
  const saving = create.isPending || update.isPending;
  const publicUrl = bootcamp.data ? `https://sparx.works/bootcamp/${bootcamp.data.slug}` : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Bootcamp actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={saving}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            {isNew ? 'Save draft' : 'Save'}
          </Button>
        }
        controls={
          <>
            {state ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="size-4" aria-hidden />
                <Text as="span" className="text-sm font-medium">
                  New bootcamp
                </Text>
              </span>
            )}
            {!isNew && status === 'draft' && isCertified ? (
              <Button
                size="sm"
                variant="outline"
                color="module"
                loading={setStatus.isPending}
                onClick={() => {
                  void onPublish();
                }}
              >
                <Rocket className="size-4" aria-hidden />
                Publish
              </Button>
            ) : null}
            {!isNew && status === 'published' ? (
              <Button
                size="sm"
                variant="outline"
                color="danger"
                loading={setStatus.isPending}
                onClick={() => {
                  void onCancel();
                }}
              >
                <XCircle className="size-4" aria-hidden />
                Cancel
              </Button>
            ) : null}
          </>
        }
        refresh={
          isNew ? null : (
            <RefreshButton
              isFetching={bootcamp.isFetching}
              updatedAt={bootcamp.data ? bootcamp.dataUpdatedAt : undefined}
              onRefresh={() => {
                void bootcamp.refetch();
              }}
            />
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {!isNew && status === 'draft' && !isCertified ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>Publishing needs the Certified tier</AlertTitle>
                <AlertDescription>
                  You can build and save this cohort as a draft now. Publishing it to the public
                  sparx directory unlocks when you reach the Certified partner tier.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {!isNew && status === 'published' && publicUrl ? (
            <Alert color="success" variant="soft">
              <AlertContent>
                <AlertTitle>This bootcamp is live</AlertTitle>
                <AlertDescription>
                  It’s on the public directory and taking sign-ups. Each on-platform sign-up becomes
                  a lead in your CRM.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
                render={<a href={publicUrl} target="_blank" rel="noreferrer" />}
              >
                View public page
              </Button>
            </Alert>
          ) : null}

          <FormSection title="What it is">
            <Field>
              <FieldLabel required>Title</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={form.title}
                    placeholder="Getting started with sparx Commerce"
                    onChange={(event) => {
                      set('title', event.target.value);
                    }}
                  />
                }
              />
              {!titleOk ? (
                <FieldStatus status="error">A bootcamp needs a title.</FieldStatus>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              {/* Uncontrolled (defaultValue, not value): the editor seeds once from
                  the loaded description and reports edits via onValueChange. The pane
                  is last-write-wins and never pushes server HTML back in, so the
                  controlled-value sync (which fires flushSync inside a React lifecycle)
                  is neither needed nor wanted. Keyed on the pane id so a create→edit
                  transition re-seeds it from the saved bootcamp. */}
              <RichTextEditor
                key={id}
                defaultValue={form.description}
                placeholder="What people will learn, who it’s for, and what they need to bring."
                onValueChange={(html) => {
                  set('description', html);
                }}
              />
              <FieldDescription>
                Headings, lists, and links are welcome — this shows on the public bootcamp page.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Format</FieldLabel>
              <Select
                color="module"
                items={FORMAT_ITEMS}
                value={form.format}
                aria-label="How the bootcamp runs"
                onValueChange={(next) => {
                  set('format', next as BootcampFormat);
                }}
              />
            </Field>
          </FormSection>

          {needsLocation ? (
            <FormSection
              title="Where it happens"
              description="Shown to people deciding whether they can attend in person."
            >
              <div className="grid gap-3 @md:grid-cols-3">
                <Field className="@md:col-span-1">
                  <FieldLabel>City</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={form.locationCity}
                        onChange={(event) => {
                          set('locationCity', event.target.value);
                        }}
                      />
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>State or region</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={form.locationState}
                        onChange={(event) => {
                          set('locationState', event.target.value);
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
                        value={form.locationCountry}
                        placeholder="US"
                        maxLength={2}
                        spellCheck={false}
                        className="uppercase"
                        onChange={(event) => {
                          set('locationCountry', event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>Two-letter country code.</FieldDescription>
                </Field>
              </div>
            </FormSection>
          ) : null}

          <FormSection title="When it runs">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel required>Starts</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) => {
                        set('startsAt', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel required>Ends</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => {
                        set('endsAt', event.target.value);
                      }}
                    />
                  }
                />
                {form.startsAt && form.endsAt && !datesOk ? (
                  <FieldStatus status="error">The end must be on or after the start.</FieldStatus>
                ) : null}
              </Field>
            </div>
          </FormSection>

          <FormSection title="Seats and price">
            <div className="grid gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel>Seats</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={form.seatsTotal}
                      placeholder="Unlimited"
                      onChange={(event) => {
                        set('seatsTotal', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Leave blank for no limit.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Price per seat</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={form.price}
                      placeholder="0.00"
                      className="text-right tabular-nums"
                      onChange={(event) => {
                        set('price', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Leave blank for free.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Currency</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.currency}
                      placeholder="USD"
                      maxLength={3}
                      spellCheck={false}
                      className="uppercase"
                      onChange={(event) => {
                        set('currency', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="How people sign up">
            <Field>
              <FieldLabel>Sign-up method</FieldLabel>
              <Select
                color="module"
                items={MODE_ITEMS}
                value={form.registrationMode}
                aria-label="How people sign up"
                onValueChange={(next) => {
                  set('registrationMode', next as RegistrationMode);
                }}
              />
              <FieldDescription>
                Sign-ups on sparx drop a lead straight into your CRM. Choose your own link if you
                take registrations somewhere else.
              </FieldDescription>
            </Field>
            {form.registrationMode === 'external' ? (
              <Field>
                <FieldLabel required>Your sign-up link</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="url"
                      value={form.registrationUrl}
                      placeholder="https://…"
                      spellCheck={false}
                      onChange={(event) => {
                        set('registrationUrl', event.target.value);
                      }}
                    />
                  }
                />
                {!urlOk ? (
                  <FieldStatus status="error">
                    Add the link people should use to sign up.
                  </FieldStatus>
                ) : null}
              </Field>
            ) : null}
          </FormSection>

          {/* Draft delete: rare and irreversible, so a quiet row under a divider
              after the work — never a loud card. Only drafts can be deleted. */}
          {!isNew && status === 'draft' ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex min-w-0 flex-col">
                <Text className="font-medium">Delete this draft</Text>
                <Text className="text-sm">
                  Remove it for good. Only unpublished drafts can be deleted.
                </Text>
              </div>
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
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
