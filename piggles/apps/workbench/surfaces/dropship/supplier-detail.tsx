'use client';

// One supplier — connect it, then manage it.
//
// Connect and manage are the same surface: `{ id: 'new' }` connects one, `{ id }`
// manages it. Connecting is not a fire-and-forget dialog — it stores credentials,
// a pricing rule and a per-site scope, it can fail and need fixing, and it is the
// place you come back to when a token expires. That is a durable, addressable
// thing, so it is a PANE, in two states, never a create modal.
//
// The supplier's NAME is its editable field, not also a read-only heading — an
// editable detail shows identity once. Its live state and the things you DO to it
// (sync its catalog, browse what it offers, disconnect it) ride the toolbar and a
// plain row after the form, so the rare, irreversible disconnect never sits with
// equal weight beside the settings someone came to change.

import { shownInPlace } from '@wizeworks/query';
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
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  Select,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faArrowUpRightFromSquare,
  faArrowsRotate,
  faBoxMagnifyingGlass,
  faPlug,
  faPlugCircleXmark,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useSites } from '../sites/data';
import {
  dropshipErrorMessage,
  supplierState,
  useCreateSupplier,
  useDeleteSupplier,
  useSupplier,
  useSyncSupplier,
  useUpdateSupplier,
  useVendors,
  type PricingRule,
  type PricingRuleType,
  type Supplier,
  type SupplierType,
  type Vendor,
  type VendorCredentialField,
} from './dropship-data';
import { productCopy } from '../../lib/product';
import { SaveFailure } from '@/components/save-failure';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/* ── Pricing rule ───────────────────────────────────────────────────────── */

type PricingKind = 'suggested' | PricingRuleType;

const PRICING_LABELS: Record<PricingKind, string> = {
  suggested: 'Use the price the supplier suggests',
  percentage_markup: 'Add a percentage on top of their cost',
  multiplier: 'Multiply their cost',
  flat_markup: 'Add a set amount on top of their cost',
  fixed_margin: 'Keep a fixed share of every sale',
};

const ROUND_LABELS: Record<'cent' | 'dollar' | 'five_dollar', string> = {
  cent: 'To the exact cent',
  dollar: 'To the nearest dollar',
  five_dollar: 'To the nearest five dollars',
};

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  name: string;
  /** Only the credential fields the user actually (re-)typed. On edit, blank
   *  fields are omitted so the stored secret survives. */
  credentials: Record<string, string>;
  pricingKind: PricingKind;
  pricingValue: string;
  roundTo: 'cent' | 'dollar' | 'five_dollar';
  notes: string;
  /** True = enabled on every site (stores no scope rows). */
  allSites: boolean;
  siteScope: string[];
}

function emptyDraft(): Draft {
  return {
    name: '',
    credentials: {},
    pricingKind: 'suggested',
    pricingValue: '',
    roundTo: 'cent',
    notes: '',
    allSites: true,
    siteScope: [],
  };
}

function pricingToDraft(
  rule: PricingRule | null
): Pick<Draft, 'pricingKind' | 'pricingValue' | 'roundTo'> {
  if (!rule) return { pricingKind: 'suggested', pricingValue: '', roundTo: 'cent' };
  const value = rule.type === 'flat_markup' ? (rule.value / 100).toFixed(2) : String(rule.value);
  return { pricingKind: rule.type, pricingValue: value, roundTo: rule.roundTo ?? 'cent' };
}

function toDraft(supplier: Supplier): Draft {
  return {
    name: supplier.name,
    credentials: {},
    ...pricingToDraft(supplier.pricingRule),
    notes: supplier.notes ?? '',
    allSites: supplier.siteScope.length === 0,
    siteScope: supplier.siteScope,
  };
}

function buildPricingRule(draft: Draft): { rule: PricingRule | null; error: string | null } {
  if (draft.pricingKind === 'suggested') return { rule: null, error: null };
  const raw = Number(draft.pricingValue);
  if (draft.pricingValue.trim() === '' || !Number.isFinite(raw) || raw <= 0) {
    return { rule: null, error: 'Enter a number greater than zero for the pricing rule.' };
  }
  if (draft.pricingKind === 'fixed_margin' && raw >= 100) {
    return { rule: null, error: 'A kept share must be less than 100%.' };
  }
  const value = draft.pricingKind === 'flat_markup' ? Math.round(raw * 100) : raw;
  return { rule: { type: draft.pricingKind, value, roundTo: draft.roundTo }, error: null };
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function SupplierDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <ConnectSupplier ctx={ctx} /> : <ManageSupplier ctx={ctx} id={id} />;
}

/* ── Connect (create) ───────────────────────────────────────────────────── */

function ConnectSupplier({ ctx }: { ctx: SurfaceContext }) {
  const { data: vendors, isPending, isError, refetch } = useVendors();
  const [slug, setSlug] = useState<SupplierType | ''>('');

  useEffect(() => {
    ctx.setTitle('Connect a supplier');
  }, [ctx]);

  if (isError) {
    return (
      <LoadError
        title="Could not load the supplier types"
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (isPending || !vendors) {
    return <PaneWaiting />;
  }

  const chosen = vendors.find((v) => v.slug === slug) ?? null;

  return (
    <SupplierEditor
      ctx={ctx}
      mode="new"
      vendor={chosen}
      vendorPicker={
        <FormSection
          title="What kind of supplier is this?"
          description="Pick who holds and ships the stock. Each one connects a little differently."
        >
          <Field>
            <FieldLabel>Supplier type</FieldLabel>
            <Select
              color="module"
              aria-label="Supplier type"
              value={slug}
              placeholder="Choose a supplier type…"
              items={Object.fromEntries(vendors.map((v) => [v.slug, v.label]))}
              onValueChange={(next) => {
                setSlug(next as SupplierType);
              }}
            />
            {chosen ? <FieldDescription>{chosen.description}</FieldDescription> : null}
          </Field>
        </FormSection>
      }
    />
  );
}

/* ── Manage (edit) ──────────────────────────────────────────────────────── */

function ManageSupplier({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: supplier,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useSupplier(id);

  useEffect(() => {
    if (supplier) ctx.setTitle(supplier.name);
  }, [ctx, supplier]);

  if (isError) {
    return (
      <LoadError
        error={error}
        noun="supplier"
        title="Could not load this supplier"
        description="This is a problem reaching the server, or the supplier has been disconnected. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (isPending || !supplier) {
    return <PaneWaiting />;
  }

  return (
    <SupplierEditor
      ctx={ctx}
      mode="edit"
      supplier={supplier}
      vendor={null}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

/* ── The shared editor ──────────────────────────────────────────────────── */

function SupplierEditor({
  ctx,
  mode,
  supplier,
  vendor,
  vendorPicker,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  mode: 'new' | 'edit';
  supplier?: Supplier;
  /** The chosen vendor when connecting; null once editing (the supplier carries
   *  its own credential-field spec). */
  vendor: Vendor | null;
  vendorPicker?: React.ReactNode;
  /** The loader's query, threaded down. Absent while connecting — a supplier
   *  that does not exist yet has nothing to re-read. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = mode === 'new';
  const toast = useToast();
  const confirm = useConfirm();
  const { data: sites } = useSites();

  const create = useCreateSupplier();
  const update = useUpdateSupplier(supplier?.id ?? 'new');
  const sync = useSyncSupplier(supplier?.id ?? 'new');
  const remove = useDeleteSupplier(supplier?.id ?? 'new');

  const saved = useMemo(() => (supplier ? toDraft(supplier) : emptyDraft()), [supplier]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setCredential = (fieldKey: string, value: string) => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      credentials: { ...current.credentials, [fieldKey]: value },
    }));
  };
  const toggleSite = (siteId: string, on: boolean) => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      siteScope: on
        ? [...current.siteScope, siteId]
        : current.siteScope.filter((s) => s !== siteId),
    }));
  };

  const credentialFields: VendorCredentialField[] = isNew
    ? (vendor?.credentialFields ?? [])
    : (supplier?.credentialFields ?? []);

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This supplier has not been connected yet. Close anyway?'
      : 'This supplier has unsaved changes. Close anyway?'
  );

  /* ── Validation ─────────────────────────────────────────────────────────── */

  const nameError = draft.name.trim() === '' ? 'Give the supplier a name.' : null;
  const typeError = isNew && !vendor ? 'Choose a supplier type first.' : null;
  const missingCredential =
    isNew && vendor
      ? credentialFields.find((f) => f.required && (draft.credentials[f.key] ?? '').trim() === '')
      : undefined;
  const credentialError = missingCredential
    ? `Enter the ${missingCredential.label.toLowerCase()} — it is needed to connect.`
    : null;
  const scopeError =
    !draft.allSites && draft.siteScope.length === 0
      ? 'Choose at least one site, or switch back to every site.'
      : null;
  const { rule: pricingRule, error: pricingError } = buildPricingRule(draft);

  const blocked = nameError ?? typeError ?? credentialError ?? scopeError ?? pricingError;

  const failure =
    create.isError || update.isError
      ? dropshipErrorMessage(
          create.error ?? update.error,
          'Could not save this supplier. Nothing was changed.'
        )
      : null;

  /* ── Save ───────────────────────────────────────────────────────────────── */

  const submit = () => {
    if (blocked) return;
    const siteScope = draft.allSites ? [] : draft.siteScope;
    const notes = draft.notes.trim() === '' ? null : draft.notes.trim();

    if (isNew) {
      if (!vendor) return;
      create.mutate(
        {
          name: draft.name.trim(),
          type: vendor.slug,
          credentials: draft.credentials,
          pricingRule,
          notes,
          siteScope,
        },
        {
          onSuccess: (created) => {
            ctx.open('dropship.supplier.detail', { id: created.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({
                title: `${created.name} connected`,
                description:
                  created.status === 'active'
                    ? 'Now sync its catalog to bring its products in.'
                    : 'Check its credentials — the connection did not come up healthy.',
                type: created.status === 'active' ? 'success' : 'warning',
              });
            });
          },
          onError: shownInPlace,
        }
      );
      return;
    }

    // Only send credential fields that were actually typed — a blank field keeps
    // the stored secret (the API merges what it receives over the stored bag).
    const typedCredentials = Object.fromEntries(
      Object.entries(draft.credentials).filter(([, v]) => v.trim() !== '')
    );
    update.mutate(
      {
        name: draft.name.trim(),
        ...(Object.keys(typedCredentials).length > 0 ? { credentials: typedCredentials } : {}),
        pricingRule,
        notes,
        siteScope,
      },
      {
        onSuccess: () => {
          setTouched(false);
          setDraft((current) => ({ ...current, credentials: {} }));
          toast.add({ title: 'Supplier saved', type: 'success' });
        },
        onError: shownInPlace,
      }
    );
  };

  /* ── Lifecycle actions (edit only) ──────────────────────────────────────── */

  const onSync = () => {
    if (!supplier) return;
    sync.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title: `Syncing ${supplier.name}`,
          description:
            result.publishesConfirmed > 0
              ? `Its catalog is refreshing and ${String(result.publishesConfirmed)} pending listings were confirmed.`
              : 'Its catalog is refreshing — new products appear shortly.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not start a sync',
          description: dropshipErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onDisconnect = async () => {
    if (!supplier) return;
    const ok = await confirm({
      title: `Disconnect ${supplier.name}?`,
      description:
        'This removes the connection. Products you already imported from this supplier stay in your catalog, but they stop updating from it and new orders will no longer be routed to it automatically. You can connect it again later.',
      confirmLabel: 'Disconnect it',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${supplier.name} disconnected`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not disconnect this supplier',
          description: dropshipErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const state = supplier ? supplierState(supplier.status) : null;
  const showRoundTo =
    draft.pricingKind === 'percentage_markup' ||
    draft.pricingKind === 'multiplier' ||
    draft.pricingKind === 'flat_markup' ||
    draft.pricingKind === 'fixed_margin';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Supplier actions"
        refresh={
          onRefresh ? (
            <RefreshButton
              isFetching={Boolean(isFetching)}
              updatedAt={supplier ? updatedAt : undefined}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        status={
          state ? (
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
          ) : null
        }
        primary={
          <>
            {supplier ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  className="ml-auto shrink-0"
                  onClick={(event) => {
                    ctx.open(
                      'dropship.products.list',
                      { supplierId: supplier.id },
                      { target: targetFor(event) }
                    );
                  }}
                >
                  <Icon glyph={faBoxMagnifyingGlass} className="size-4" aria-hidden />
                  Browse products
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  className="shrink-0"
                  loading={sync.isPending}
                  disabled={supplier.status === 'error'}
                  title={
                    supplier.status === 'error'
                      ? 'Fix the connection before syncing'
                      : 'Refresh this supplier’s catalog now'
                  }
                  onClick={onSync}
                >
                  <Icon glyph={faArrowsRotate} className="size-4" aria-hidden />
                  Sync now
                </Button>
              </>
            ) : null}
            <Button
              color="module"
              size="sm"
              className={supplier ? 'shrink-0' : 'ml-auto shrink-0'}
              loading={saving}
              disabled={Boolean(blocked) || (!isNew && !dirty)}
              onClick={submit}
            >
              {isNew ? (
                <>
                  <Icon glyph={faPlug} className="size-4" aria-hidden />
                  Connect
                </>
              ) : (
                'Save'
              )}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <Text>
              Link a business that holds stock and ships it to your customers. Once connected you
              can import its products and route orders to it automatically.
            </Text>
          ) : null}

          <SaveFailure title="Could not save this supplier" message={failure} />

          {/* On edit, the one status message — the most specific true thing about
              the connection right now. */}
          {state && supplier ? (
            <Alert color={state.tone} variant="soft">
              <AlertContent>
                <AlertTitle>{state.label}</AlertTitle>
                <AlertDescription>{state.detail}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {vendorPicker}

          {/* Everything below needs a type chosen (new) or a loaded supplier. */}
          {isNew && !vendor ? null : (
            <>
              <FormSection title="Name">
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color={nameError && touched ? 'error' : 'module'}
                        value={draft.name}
                        placeholder={vendor ? `My ${vendor.label} account` : 'Supplier name'}
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
                      For you — how you tell this supplier apart from your others.
                      {!isNew && supplier ? ` This is a ${supplier.vendorLabel} connection.` : ''}
                    </FieldDescription>
                  )}
                </Field>
              </FormSection>

              {credentialFields.length > 0 ? (
                <FormSection
                  title="Connection details"
                  description={
                    isNew
                      ? productCopy(
                          'dropship.supplier.keys',
                          'The keys that let Piggles talk to this supplier on your behalf. They are stored securely and never shown again.'
                        )
                      : 'Already stored securely and never shown. Fill a field in only to replace it.'
                  }
                  action={
                    !isNew && supplier?.credentialsSet ? (
                      <Badge color="success" variant="soft" size="sm">
                        Saved
                      </Badge>
                    ) : undefined
                  }
                >
                  {credentialFields.map((field) => {
                    const invalid =
                      isNew &&
                      touched &&
                      field.required &&
                      (draft.credentials[field.key] ?? '').trim() === '';
                    return (
                      <Field key={field.key}>
                        <FieldLabel>{field.label}</FieldLabel>
                        <FieldControl
                          render={
                            <Input
                              color={invalid ? 'error' : 'module'}
                              type={field.type === 'password' ? 'password' : 'text'}
                              inputMode={field.type === 'url' ? 'url' : undefined}
                              autoComplete="off"
                              spellCheck={false}
                              value={draft.credentials[field.key] ?? ''}
                              placeholder={
                                isNew
                                  ? field.placeholder
                                  : supplier?.credentialsSet
                                    ? 'Leave blank to keep the stored value'
                                    : field.placeholder
                              }
                              onChange={(event) => {
                                setCredential(field.key, event.target.value);
                              }}
                            />
                          }
                        />
                        {invalid ? (
                          <FieldStatus status="error">This is needed to connect.</FieldStatus>
                        ) : field.help ? (
                          <FieldDescription>{field.help}</FieldDescription>
                        ) : null}
                      </Field>
                    );
                  })}
                  {isNew && vendor?.credentialsHelpUrl ? (
                    <Text className="text-sm">
                      Not sure where to find these?{' '}
                      <a
                        href={vendor.credentialsHelpUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="link inline-flex items-center gap-1"
                      >
                        {vendor.label}’s guide
                        <Icon glyph={faArrowUpRightFromSquare} className="size-3" aria-hidden />
                      </a>
                    </Text>
                  ) : null}
                </FormSection>
              ) : null}

              <FormSection
                title="Your selling price"
                description="How your price is worked out from what this supplier charges you, when you import their products."
              >
                <Field>
                  <FieldLabel>Pricing rule</FieldLabel>
                  <Select
                    color="module"
                    aria-label="Pricing rule"
                    value={draft.pricingKind}
                    items={PRICING_LABELS}
                    onValueChange={(next) => {
                      set('pricingKind', next as PricingKind);
                    }}
                  />
                </Field>

                {draft.pricingKind !== 'suggested' ? (
                  <div className="grid gap-3 @md:grid-cols-2">
                    <Field>
                      <FieldLabel>{pricingValueLabel(draft.pricingKind)}</FieldLabel>
                      <FieldControl
                        render={
                          <div className="flex max-w-[12rem] items-center gap-2">
                            {draft.pricingKind === 'flat_markup' ? (
                              <Text as="span" className="text-lg">
                                $
                              </Text>
                            ) : null}
                            <Input
                              color={pricingError ? 'error' : 'module'}
                              type="number"
                              min={0}
                              step={draft.pricingKind === 'multiplier' ? '0.1' : '0.01'}
                              inputMode="decimal"
                              value={draft.pricingValue}
                              placeholder={draft.pricingKind === 'multiplier' ? '2' : '50'}
                              onChange={(event) => {
                                set('pricingValue', event.target.value);
                              }}
                            />
                            {draft.pricingKind === 'percentage_markup' ||
                            draft.pricingKind === 'fixed_margin' ? (
                              <Text as="span" className="text-lg">
                                %
                              </Text>
                            ) : draft.pricingKind === 'multiplier' ? (
                              <Text as="span" className="text-lg">
                                ×
                              </Text>
                            ) : null}
                          </div>
                        }
                      />
                      {pricingError ? (
                        <FieldStatus status="error">{pricingError}</FieldStatus>
                      ) : null}
                    </Field>
                    {showRoundTo ? (
                      <Field>
                        <FieldLabel>Round the price</FieldLabel>
                        <Select
                          color="module"
                          aria-label="Rounding"
                          value={draft.roundTo}
                          items={ROUND_LABELS}
                          onValueChange={(next) => {
                            set('roundTo', next as Draft['roundTo']);
                          }}
                        />
                      </Field>
                    ) : null}
                  </div>
                ) : (
                  <Text className="text-sm">
                    Each product is priced at whatever the supplier suggests. You can still change
                    any price by hand after importing.
                  </Text>
                )}
              </FormSection>

              <FormSection
                title="Which sites use this supplier"
                description="Turn this off to limit the supplier to particular sites — for example if only one of your sites sells its products."
              >
                <Field>
                  <FieldLabel>Available on every site</FieldLabel>
                  <FieldControl
                    render={
                      <Checkbox
                        color="module"
                        checked={draft.allSites}
                        onChange={(event) => {
                          set('allSites', event.target.checked);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    {draft.allSites
                      ? 'Every site on this account can import from and route orders to this supplier.'
                      : 'Only the sites ticked below can use this supplier.'}
                  </FieldDescription>
                </Field>

                {!draft.allSites ? (
                  <div className="flex flex-col gap-2">
                    {(sites ?? []).map((site) => (
                      <Checkbox
                        key={site.id}
                        color="module"
                        checked={draft.siteScope.includes(site.id)}
                        onChange={(event) => {
                          toggleSite(site.id, event.target.checked);
                        }}
                      >
                        {site.name}
                      </Checkbox>
                    ))}
                    {scopeError ? <FieldStatus status="error">{scopeError}</FieldStatus> : null}
                  </div>
                ) : null}
              </FormSection>

              <FormSection title="Notes">
                <Field>
                  <FieldLabel>Private notes (optional)</FieldLabel>
                  <FieldControl
                    render={
                      <Textarea
                        color="module"
                        rows={3}
                        value={draft.notes}
                        placeholder="Anything worth remembering — contact details, minimums, quirks."
                        onChange={(event) => {
                          set('notes', event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>Only your team sees these.</FieldDescription>
                </Field>
              </FormSection>

              {!isNew && supplier ? (
                <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <Text className="text-sm">
                    Disconnecting stops this supplier syncing and receiving new orders. Products you
                    already imported stay in your catalog.
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    color="danger"
                    className="shrink-0"
                    loading={remove.isPending}
                    onClick={() => {
                      void onDisconnect();
                    }}
                  >
                    <Icon glyph={faPlugCircleXmark} className="size-4" aria-hidden />
                    Disconnect
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pricingValueLabel(kind: PricingKind): string {
  switch (kind) {
    case 'percentage_markup':
      return 'Percentage to add';
    case 'multiplier':
      return 'Multiply by';
    case 'flat_markup':
      return 'Amount to add';
    case 'fixed_margin':
      return 'Share to keep';
    case 'suggested':
      return '';
  }
}

function LoadError({
  title,
  description,
  error,
  noun,
  onRetry,
}: {
  title: string;
  description?: string;
  error?: unknown;
  noun?: string;
  onRetry: () => void;
}) {
  return (
    <div className={`${PANE_SHELL} p-2`}>
      <Card className="min-h-0 flex-1 items-center justify-center">
        <PaneLoadError
          error={error}
          noun={noun}
          title={<>{title}</>}
          description={
            <>{description ?? 'This is a problem reaching the server. Please try again.'}</>
          }
          onRetry={onRetry}
        />
      </Card>
    </div>
  );
}
