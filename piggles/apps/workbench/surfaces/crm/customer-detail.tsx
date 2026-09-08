'use client';

// One customer — add them, then live in their PROFILE.
//
// Add and manage are the same surface: `{ id: 'new' }` builds a customer,
// `{ id }` opens their profile. Creating is a single focused column (there is
// nothing to profile yet). Managing is a real customer profile: a persistent
// identity rail on the left — who they are, how to reach them, the facts you do
// not edit — and a tabbed workspace on the right that opens on an Overview of
// what they are worth and what has happened, with their Orders, Deals, Tasks and
// Activity each a tab onto the REAL records, and the editable form living on its
// own Details tab.
//
// ── Where identity shows, and why the rail carries the name ───────────────
//
// The platform rule is that an entity shows its identity ONCE, as the field you
// change it in — not as a read-only heading stacked above that field. A read-
// first profile satisfies that rule rather than fighting it: the name is DISPLAY
// in the rail (the persistent masthead, an aside, exactly as every CRM the
// references show), and it is EDITABLE only on the Details tab. The two are the
// read view and the edit view of the same fact, not a heading duplicating a
// field in one column.
//
// ── Where Save lives ──────────────────────────────────────────────────────
//
// Only the Details tab edits, so the shell owns the draft and the toolbar owns
// the single Save — enabled whenever there are unsaved changes, reachable from
// any tab, with a dirty dot on the Details tab so the scope is legible while you
// stand on Overview. Removing a customer is rare and irreversible, so it sits in
// a quiet row at the end of the Details form.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  MetadataItem,
  MetadataList,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TagInput,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faBuilding,
  faCamera,
  faPlus,
  faSpinner,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { CustomPropertiesPanel } from './custom-properties-panel';
import { AssociationsPanel } from './associations-panel';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useTeamRoster } from '../../lib/api/team';
import { useAccounts } from './companies-data';
import { useModuleStates } from '../../lib/api/shell-data';
import { useMediaAssets, useUploadMedia } from '../commerce/products-data';
import { CustomerAddressesSection } from './customer-addresses';
import { CustomerDocumentsTab } from './customer-documents-tab';
import { CustomerOverviewTab } from './customer-overview';
import {
  CustomerActivityTab,
  CustomerDealsTab,
  CustomerInvoicesTab,
  CustomerNotesTab,
  CustomerOrdersTab,
  CustomerSubscriptionsTab,
  CustomerTasksTab,
} from './customer-related';
import { CustomerBookingsTab } from './customer-bookings';
import {
  customerErrorMessage,
  useCreateCustomer,
  useCustomer,
  useDeleteCustomer,
  useUpdateCustomer,
  type Customer,
  type CustomerInput,
  type CustomerType,
  type LeadStatus,
  type LifecycleStage,
} from './customers-data';
import {
  LEAD_STATUSES,
  LIFECYCLE_STAGES,
  RELATIONSHIP_TYPES,
  customerInitials,
  customerName,
  customerTypeMeta,
  leadStatusMeta,
  lifecycleStageMeta,
  joinedMonth,
} from './customer-display';

// The focused single column a NEW customer is created in — no profile to show yet.
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const CONTACT_METHODS: Record<string, string> = {
  '': 'No preference',
  email: 'Email',
  phone: 'Phone call',
  sms: 'Text message',
};

const CONTACT_METHOD_LABEL: Record<string, string> = {
  email: 'Email',
  phone: 'Phone call',
  sms: 'Text message',
};

const TABS: { value: string; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'notes', label: 'Notes' },
  // Before the money tabs: for a service business — a salon, a clinic, a garage
  // — what someone has been booked for IS their history with you, and it is the
  // thing you check before they sit down.
  { value: 'bookings', label: 'Bookings' },
  { value: 'orders', label: 'Orders' },
  // Next to Orders on purpose: what they bought and what they were asked to pay
  // are the two money questions, and a business can have either without the other.
  { value: 'invoices', label: 'Invoices' },
  { value: 'deals', label: 'Deals' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'activity', label: 'Activity' },
  { value: 'documents', label: 'Documents' },
  { value: 'details', label: 'Details' },
];

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  type: CustomerType;
  lifecycleStage: LifecycleStage;
  /** '' = not set (the nullable lead-status column). */
  leadStatus: LeadStatus | '';
  email: string;
  phone: string;
  preferredContactMethod: string;
  doNotContact: boolean;
  assignedRepId: string;
  companyId: string;
  tags: string[];
  /** The extra details THIS business tracks (docs/144 §3). Shape is per-tenant. */
  customProperties: Record<string, unknown>;
}

function emptyDraft(): Draft {
  return {
    firstName: '',
    lastName: '',
    company: '',
    jobTitle: '',
    type: 'retail',
    lifecycleStage: 'lead',
    leadStatus: '',
    email: '',
    phone: '',
    preferredContactMethod: '',
    doNotContact: false,
    assignedRepId: '',
    companyId: '',
    tags: [],
    customProperties: {},
  };
}

function toDraft(c: Customer): Draft {
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    company: c.company ?? '',
    jobTitle: c.jobTitle ?? '',
    type: c.type,
    lifecycleStage: c.lifecycleStage,
    leadStatus: c.leadStatus ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    preferredContactMethod: c.preferredContactMethod ?? '',
    doNotContact: c.doNotContact,
    assignedRepId: c.assignedRepId ?? '',
    companyId: c.companyId ?? '',
    tags: c.tags,
    customProperties: c.customProperties ?? {},
  };
}

const trimOrNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* ── Surface ────────────────────────────────────────────────────────────── */

export function CustomerDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? (
    <CustomerEditor ctx={ctx} id="new" />
  ) : (
    <CustomerLoader ctx={ctx} id={id} />
  );
}

function CustomerLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: customer,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useCustomer(id);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="customer"
            title="Could not load this customer"
            description="This is a problem reaching the server, or the customer has been removed. Nothing has been changed."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !customer) {
    return <PaneWaiting />;
  }

  return (
    <CustomerEditor
      ctx={ctx}
      id={id}
      customer={customer}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

function CustomerEditor({
  ctx,
  id,
  customer,
  isFetching = false,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  customer?: Customer;
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateCustomer();
  const update = useUpdateCustomer(id);
  const remove = useDeleteCustomer(id);

  const { members } = useTeamRoster();
  const { data: accounts } = useAccounts();

  const saved = useMemo(() => (customer ? toDraft(customer) : emptyDraft()), [customer]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const [tab, setTab] = useState('overview');
  // Lazy-then-keep: a tab's data only loads once you open it (so a pane doesn't
  // fire six queries at once), and stays mounted after — read-only tabs cost
  // nothing to keep, and the Details draft lives in this shell, not the panel,
  // so nothing is lost either way.
  const visited = useRef(new Set<string>(['overview']));
  visited.current.add(tab);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New customer' : customer ? customerName(customer) : 'Customer');
  }, [ctx, isNew, customer]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This customer has not been added yet. Close anyway?'
      : 'This customer has unsaved changes. Close anyway?'
  );

  /* ── Options ──────────────────────────────────────────────────────────── */

  // Reps are keyed by staff USER id (what a customer's assignedRepId points at),
  // not the team-membership id. A saved rep who has since left the team is no
  // longer in the roster, so a placeholder keeps the Select from showing a blank.
  const repItems = useMemo(() => {
    const items: Record<string, string> = { '': 'No one assigned' };
    for (const m of members) items[m.userId] = m.name ?? m.email;
    if (draft.assignedRepId && !items[draft.assignedRepId]) {
      items[draft.assignedRepId] = 'A former team member';
    }
    return items;
  }, [members, draft.assignedRepId]);

  const accountItems = useMemo(() => {
    const items: Record<string, string> = { '': 'Not linked to an account' };
    for (const a of accounts?.items ?? []) items[a.id] = a.companyName;
    if (draft.companyId && !items[draft.companyId]) {
      items[draft.companyId] = 'A removed account';
    }
    return items;
  }, [accounts, draft.companyId]);

  /* ── Validation ───────────────────────────────────────────────────────── */

  const hasIdentity =
    draft.firstName.trim() !== '' ||
    draft.lastName.trim() !== '' ||
    draft.company.trim() !== '' ||
    draft.email.trim() !== '';
  const nameError = hasIdentity
    ? null
    : 'Enter a name, company or email so you can find this person later.';
  const emailError =
    draft.email.trim() !== '' && !EMAIL_RE.test(draft.email.trim())
      ? 'Enter a valid email like name@example.com.'
      : null;
  const blocked = nameError ?? emailError;

  const failure =
    create.isError || update.isError
      ? customerErrorMessage(
          create.error ?? update.error,
          'The server did not answer. Nothing was changed and your work is still on screen — try again in a moment.'
        )
      : null;

  /* ── Build + submit ───────────────────────────────────────────────────── */

  const buildInput = (): CustomerInput => ({
    type: draft.type,
    lifecycleStage: draft.lifecycleStage,
    leadStatus: draft.leadStatus === '' ? null : draft.leadStatus,
    email: trimOrNull(draft.email),
    phone: trimOrNull(draft.phone),
    firstName: trimOrNull(draft.firstName),
    lastName: trimOrNull(draft.lastName),
    company: trimOrNull(draft.company),
    jobTitle: trimOrNull(draft.jobTitle),
    // A wholesale link only means anything for a wholesale contact; clearing the
    // link when the kind changes keeps the record honest.
    companyId: draft.type === 'b2b' ? draft.companyId || null : null,
    assignedRepId: draft.assignedRepId || null,
    preferredContactMethod: draft.preferredContactMethod
      ? (draft.preferredContactMethod as 'email' | 'phone' | 'sms')
      : null,
    doNotContact: draft.doNotContact,
    tags: draft.tags,
    customProperties: draft.customProperties,
  });

  const submit = () => {
    if (blocked) return;
    const input = buildInput();

    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('crm.customer.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${customerName(created)} added`, type: 'success' });
          });
        },
        onError: shownInPlace,
      });
      return;
    }

    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Customer saved', type: 'success' });
      },
      onError: shownInPlace,
    });
  };

  const onDelete = async () => {
    if (!customer) return;
    const name = customerName(customer);
    const ok = await confirm({
      title: `Remove ${name}?`,
      description:
        'This takes the customer out of your lists. Their past orders and history are kept for your records, and you can add them again later. Nothing is emailed to them.',
      confirmLabel: 'Remove this customer',
      cancelLabel: 'Keep them',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${name} removed`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this customer',
          description: customerErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const meta = customerTypeMeta(draft.type);
  const lifecycleMeta = lifecycleStageMeta(draft.lifecycleStage);

  // Wholesale is the one kind that only means something with the b2b module on —
  // it carries trade pricing + net terms. A salon or café never sees it. An
  // existing wholesale contact keeps the option even if the module is later off,
  // so its kind is never silently lost.
  const { data: moduleStates } = useModuleStates();
  const b2bEnabled = (moduleStates ?? []).some((m) => m.slug === 'b2b' && m.enabled);
  const kindTypes = RELATIONSHIP_TYPES.filter(
    (t) => t !== 'b2b' || b2bEnabled || draft.type === 'b2b'
  );

  /* ── The editable form (the Details tab, and the whole of "add") ────────── */

  const failureAlert = failure ? (
    <Alert color="error">
      <AlertContent>
        <AlertTitle>Could not save this customer</AlertTitle>
        <AlertDescription>{failure}</AlertDescription>
      </AlertContent>
    </Alert>
  ) : null;

  const detailsForm = (
    <div className="flex flex-col gap-4">
      <FormSection title="Who they are">
        <div className="grid gap-3 @md:grid-cols-2">
          <Field>
            <FieldLabel>First name</FieldLabel>
            <FieldControl
              render={
                <Input
                  color={nameError && touched ? 'error' : 'module'}
                  value={draft.firstName}
                  placeholder="Jamie"
                  onChange={(event) => {
                    set('firstName', event.target.value);
                  }}
                />
              }
            />
          </Field>
          <Field>
            <FieldLabel>Last name</FieldLabel>
            <FieldControl
              render={
                <Input
                  color={nameError && touched ? 'error' : 'module'}
                  value={draft.lastName}
                  placeholder="Rivera"
                  onChange={(event) => {
                    set('lastName', event.target.value);
                  }}
                />
              }
            />
          </Field>
        </div>
        {nameError && touched ? <FieldStatus status="error">{nameError}</FieldStatus> : null}

        <div className="grid gap-3 @md:grid-cols-2">
          <Field>
            <FieldLabel>Company</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={draft.company}
                  placeholder="Rivera Fabrication"
                  onChange={(event) => {
                    set('company', event.target.value);
                  }}
                />
              }
            />
          </Field>
          <Field>
            <FieldLabel>Job title</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={draft.jobTitle}
                  placeholder="Owner"
                  onChange={(event) => {
                    set('jobTitle', event.target.value);
                  }}
                />
              }
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Where they stand"
        description="Three independent signals — where they are with you, what's happening right now, and how they buy."
      >
        <Field>
          <FieldLabel>Lifecycle stage</FieldLabel>
          <Select
            color="module"
            aria-label="Lifecycle stage"
            value={draft.lifecycleStage}
            items={Object.fromEntries(
              LIFECYCLE_STAGES.map((s) => [s, lifecycleStageMeta(s).label])
            )}
            onValueChange={(next) => {
              set('lifecycleStage', next as LifecycleStage);
            }}
          />
          <FieldDescription>
            {lifecycleStageMeta(draft.lifecycleStage).description}
          </FieldDescription>
        </Field>

        <div className="grid gap-3 @md:grid-cols-2">
          <Field>
            <FieldLabel>Relationship</FieldLabel>
            <Select
              color="module"
              aria-label="Relationship type"
              value={draft.type}
              items={Object.fromEntries(kindTypes.map((t) => [t, customerTypeMeta(t).label]))}
              onValueChange={(next) => {
                set('type', next as CustomerType);
              }}
            />
            <FieldDescription>{meta.description}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Lead status</FieldLabel>
            <Select
              color="module"
              aria-label="Lead status"
              value={draft.leadStatus}
              items={{
                '': 'Not set',
                ...Object.fromEntries(LEAD_STATUSES.map((s) => [s, leadStatusMeta(s).label])),
              }}
              onValueChange={(next) => {
                set('leadStatus', next as LeadStatus | '');
              }}
            />
            <FieldDescription>
              {draft.leadStatus === ''
                ? 'What a rep is doing right now. Clears once they become a customer.'
                : leadStatusMeta(draft.leadStatus).description}
            </FieldDescription>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="How to reach them"
        description="However you have it — none of this is required."
      >
        <div className="grid gap-3 @md:grid-cols-2">
          <Field>
            <FieldLabel>Email</FieldLabel>
            <FieldControl
              render={
                <Input
                  color={emailError && touched ? 'error' : 'module'}
                  type="email"
                  value={draft.email}
                  placeholder="jamie@example.com"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    set('email', event.target.value);
                  }}
                />
              }
            />
            {emailError && touched ? <FieldStatus status="error">{emailError}</FieldStatus> : null}
          </Field>
          <Field>
            <FieldLabel>Phone</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  type="tel"
                  value={draft.phone}
                  placeholder="(555) 010-2233"
                  autoComplete="off"
                  onChange={(event) => {
                    set('phone', event.target.value);
                  }}
                />
              }
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Best way to reach them</FieldLabel>
          <Select
            color="module"
            aria-label="Best way to reach them"
            value={draft.preferredContactMethod}
            items={CONTACT_METHODS}
            onValueChange={(next) => {
              set('preferredContactMethod', next as string);
            }}
          />
        </Field>

        <Field>
          <FieldLabel>Do not send marketing</FieldLabel>
          <FieldControl
            render={
              <Switch
                color="module"
                checked={draft.doNotContact}
                onCheckedChange={(next: boolean) => {
                  set('doNotContact', next);
                }}
              />
            }
          />
          <FieldDescription>
            {draft.doNotContact
              ? 'They are left out of marketing emails. Order and account messages still reach them.'
              : 'They may receive your marketing emails if they have opted in.'}
          </FieldDescription>
        </Field>
      </FormSection>

      <FormSection title="Your side of it">
        <Field>
          <FieldLabel>Looked after by</FieldLabel>
          <Select
            color="module"
            aria-label="Which team member looks after this customer"
            value={draft.assignedRepId}
            items={repItems}
            onValueChange={(next) => {
              set('assignedRepId', next as string);
            }}
          />
          <FieldDescription>The person on your team who owns this relationship.</FieldDescription>
        </Field>

        {draft.type === 'b2b' ? (
          <Field>
            <FieldLabel>Wholesale account</FieldLabel>
            <Select
              color="module"
              aria-label="Which wholesale account this contact belongs to"
              value={draft.companyId}
              items={accountItems}
              onValueChange={(next) => {
                set('companyId', next as string);
              }}
            />
            <FieldDescription>
              The business this person buys on behalf of — they get its agreed prices and terms.
            </FieldDescription>
          </Field>
        ) : null}

        <Field>
          <FieldLabel>Labels</FieldLabel>
          <FieldControl
            render={
              <TagInput
                color="module"
                value={draft.tags}
                placeholder="Type a label and press Enter"
                aria-label="Labels"
                onValueChange={(next) => {
                  set('tags', next);
                }}
              />
            }
          />
          <FieldDescription>
            Your own words for grouping people — “vip”, “trade-show”, “needs-follow-up”. Letters,
            numbers, - and _ only.
          </FieldDescription>
        </Field>
      </FormSection>

      {/* Addresses are their own records with their own immediate writes, so
          they manage here (in the "manage this customer" tab) rather than riding
          the customer Save draft. On "add" there is no customer id yet, so the
          section only appears once the customer exists. */}
      {!isNew && customer ? <CustomerAddressesSection customerId={customer.id} /> : null}

      {/* Who else this person is connected to (docs/144 §6) — the company they
          work at, the deals they are involved in, who introduced them. Writes
          immediately, so it is only offered once the person exists. */}
      {!isNew && customer ? (
        <AssociationsPanel
          objectKey="contact"
          recordId={customer.id}
          ctx={ctx}
          title="Who they are connected to"
        />
      ) : null}

      {/* The extra details this business tracks (docs/144 §3). Renders nothing at
          all until they declare some, so a tenant who has not been near Record
          types never meets an empty panel asking them to imagine what could go in
          it. It belongs HERE — with the other fields, above the removal row —
          because a section a person types into must never sit below the button
          that deletes the record. */}
      <CustomPropertiesPanel
        objectKey="contact"
        values={draft.customProperties}
        onChange={(next) => {
          // `set`, not a raw `setDraft` — it is what marks the pane touched, and
          // without it an edit made ONLY here leaves Save disabled forever.
          set('customProperties', next);
        }}
      />

      {!isNew && customer ? (
        <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Text className="text-sm">
            Removing takes this customer out of your lists. Their history is kept.
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
            Remove this customer
          </Button>
        </div>
      ) : null}
    </div>
  );

  /* ── Toolbar (shared) ─────────────────────────────────────────────────── */

  const toolbar = (
    <PaneToolbar
      label="Customer actions"
      status={
        /* The toolbar leads with the lifecycle stage — the primary "where are
                  they" signal; the relationship + lead status sit on the rail/form. */
        <Badge color={lifecycleMeta.color} variant="soft" size="sm">
          {lifecycleMeta.label}
        </Badge>
      }
      {...(!isNew && customer
        ? {
            // The things you DO to a customer, as values rather than markup —
            // two icon buttons whose labels vanished below @md were two bare `+`
            // glyphs side by side on a phone, identical and unexplained. As
            // actions they keep their names wherever the bar puts them.
            actions: [
              {
                label: 'New deal',
                icon: faPlus,
                onClick: () => {
                  ctx.open(
                    'crm.deal.detail',
                    { id: 'new', customerId: customer.id },
                    { target: 'tab' }
                  );
                },
              },
              {
                label: 'New task',
                icon: faPlus,
                onClick: () => {
                  ctx.open(
                    'crm.task.detail',
                    { id: 'new', customerId: customer.id },
                    { target: 'tab' }
                  );
                },
              },
            ],
          }
        : {})}
      primary={
        <>
          <Button
            color="module"
            size="sm"
            className="shrink-0"
            loading={saving}
            disabled={Boolean(blocked) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Add customer' : 'Save'}
          </Button>
        </>
      }
      refresh={
        onRefresh ? (
          <RefreshButton
            isFetching={isFetching}
            updatedAt={customer ? updatedAt : undefined}
            onRefresh={onRefresh}
          />
        ) : undefined
      }
    />
  );

  /* ── Add: one focused column ──────────────────────────────────────────── */

  if (isNew || !customer) {
    return (
      <div className={PANE_SHELL}>
        {toolbar}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 @lg:p-4">
          <div className={COLUMN}>
            {isNew ? (
              <Text>
                Everyone you work with or keep in touch with lives here. Fill in what you know — a
                name or an email is enough to start.
              </Text>
            ) : null}
            {failureAlert}
            {detailsForm}
          </div>
        </div>
      </div>
    );
  }

  /* ── Manage: the profile ──────────────────────────────────────────────── */

  return (
    <div className={PANE_SHELL}>
      {toolbar}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 @lg:p-4">
        <div className="@container mx-auto w-full max-w-6xl">
          <div className="grid gap-3 @3xl:grid-cols-[19rem_minmax(0,1fr)] @3xl:items-start">
            <aside className="flex min-w-0 flex-col gap-3 @3xl:sticky @3xl:top-0">
              <IdentityRail
                ctx={ctx}
                customer={customer}
                repItems={repItems}
                accountItems={accountItems}
              />
            </aside>

            <section className="flex min-w-0 flex-col gap-3">
              {failureAlert}
              <Tabs
                variant="pills"
                color="module"
                value={tab}
                onValueChange={(next) => {
                  setTab(next as string);
                }}
                className="flex flex-col gap-2 @lg:gap-3"
              >
                {/* Ten tabs do not fit a narrowed pane, and `overflow-x-auto`
                    alone hid Documents and Details behind an edge with nothing
                    to say they were there. */}
                <div className="bg-base-300 shrink-0 rounded-full px-2 py-2">
                  <TabsList scrollable>
                    {TABS.map((entry) => (
                      <TabsTab
                        key={entry.value}
                        value={entry.value}
                        className="flex items-center gap-1.5"
                      >
                        {entry.label}
                        {/* The dirty dot makes a toolbar Save honest: it says
                            "Details has unsaved work" while you stand on Overview.
                            On the selected pill it wears the pill's own ink so it
                            stays visible against the fill. */}
                        {entry.value === 'details' && dirty ? (
                          <>
                            <span
                              className={
                                entry.value === tab
                                  ? 'bg-module-content size-1.5 shrink-0 rounded-full'
                                  : 'bg-module size-1.5 shrink-0 rounded-full'
                              }
                              aria-hidden
                            />
                            <span className="sr-only">(unsaved changes)</span>
                          </>
                        ) : null}
                      </TabsTab>
                    ))}
                  </TabsList>
                </div>

                <TabsPanel value="overview">
                  {visited.current.has('overview') ? (
                    <CustomerOverviewTab ctx={ctx} customer={customer} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="notes">
                  {visited.current.has('notes') ? (
                    <CustomerNotesTab customerId={customer.id} canEmail={Boolean(customer.email)} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="bookings">
                  {visited.current.has('bookings') ? (
                    <CustomerBookingsTab ctx={ctx} customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="orders">
                  {visited.current.has('orders') ? (
                    <CustomerOrdersTab ctx={ctx} customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="invoices">
                  {visited.current.has('invoices') ? (
                    <CustomerInvoicesTab ctx={ctx} customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="deals">
                  {visited.current.has('deals') ? (
                    <CustomerDealsTab ctx={ctx} customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="tasks">
                  {visited.current.has('tasks') ? (
                    <CustomerTasksTab ctx={ctx} customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="subscriptions">
                  {visited.current.has('subscriptions') ? (
                    <CustomerSubscriptionsTab ctx={ctx} customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="activity">
                  {visited.current.has('activity') ? (
                    <CustomerActivityTab customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="documents">
                  {visited.current.has('documents') ? (
                    <CustomerDocumentsTab customerId={customer.id} />
                  ) : null}
                </TabsPanel>
                <TabsPanel value="details">
                  {visited.current.has('details') ? detailsForm : null}
                </TabsPanel>
              </Tabs>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Identity rail (the persistent read masthead) ─────────────────────────── */

function IdentityRail({
  ctx,
  customer,
  repItems,
  accountItems,
}: {
  ctx: SurfaceContext;
  customer: Customer;
  repItems: Record<string, string>;
  accountItems: Record<string, string>;
}) {
  const toast = useToast();
  const meta = customerTypeMeta(customer.type);
  const lifecycleMeta = lifecycleStageMeta(customer.lifecycleStage);
  const leadMeta = customer.leadStatus ? leadStatusMeta(customer.leadStatus) : null;
  const name = customerName(customer);
  const initials = customerInitials(customer);
  // TYPED-IN AND FILED-UNDER LOOK DIFFERENT, because they ARE different: one is
  // a word somebody wrote in a box, the other is a link to a company record with
  // its own people, terms and paperwork. Rendering both as the same grey line
  // meant accepting the association offer changed nothing you could see — the
  // banner disappeared, a toast came and went, and the card read exactly as it
  // had a second earlier. Filed reads as a link and opens the company; typed
  // stays plain text.
  const companyId = customer.companyId;
  const filedUnder = companyId !== null ? customer.company : null;
  const typedCompany = companyId === null ? customer.company : null;
  // Resolve the photo to a real URL; the Avatar falls back to initials when
  // there is no photo or it is still processing.
  const avatarAssets = useMediaAssets(
    customer.avatarMediaAssetId ? [customer.avatarMediaAssetId] : []
  );
  const photoUrl = avatarAssets.data?.[0]?.url ?? undefined;

  // The photo edits INLINE, right on the avatar — click it to upload one, and the
  // change commits on its own (it is the customer's own record, not part of the
  // name/contact Save draft, the same as addresses and documents).
  const fileRef = useRef<HTMLInputElement | null>(null);
  const upload = useUploadMedia();
  const setAvatar = useUpdateCustomer(customer.id);
  const photoBusy = upload.isPending || setAvatar.isPending;

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (mediaAssetId) => {
        setAvatar.mutate(
          { avatarMediaAssetId: mediaAssetId },
          {
            onError: () => {
              toast.add({ title: 'Could not update the photo', type: 'error' });
            },
          }
        );
      },
      onError: () => {
        toast.add({
          title: 'Could not upload that photo',
          description: 'Try a different image, or again in a moment.',
          type: 'error',
        });
      },
    });
  };

  const removePhoto = () => {
    setAvatar.mutate(
      { avatarMediaAssetId: null },
      {
        onError: () => {
          toast.add({ title: 'Could not remove the photo', type: 'error' });
        },
      }
    );
  };

  const rep = customer.assignedRepId ? repItems[customer.assignedRepId] : null;
  const account =
    customer.type === 'b2b' && customer.companyId ? accountItems[customer.companyId] : null;
  const contact = customer.preferredContactMethod
    ? CONTACT_METHOD_LABEL[customer.preferredContactMethod]
    : null;

  return (
    <section className="card bg-base-100 flex flex-col gap-4 p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            onPhoto(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            className="relative rounded-full"
            aria-label={photoUrl ? 'Change photo' : 'Add a photo'}
            disabled={photoBusy}
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            <Avatar size="xl" color="neutral" alt={name} src={photoUrl}>
              {initials}
            </Avatar>
            {/* A camera badge that says the avatar is editable, spinning while a
                new photo uploads. Absolute chrome on the avatar, not a control. */}
            <span className="border-base-100 bg-module text-module-content absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border-2">
              {photoBusy ? (
                <Icon glyph={faSpinner} className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Icon glyph={faCamera} className="size-3.5" aria-hidden />
              )}
            </span>
          </button>
          {photoUrl && !photoBusy ? (
            <Button size="xs" variant="ghost" color="danger" onClick={removePhoto}>
              Remove photo
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-1">
          <Heading level={2} className="text-lg font-semibold">
            {name}
          </Heading>
          <Text className="flex flex-wrap items-center justify-center gap-1 text-sm">
            {filedUnder !== null && companyId !== null ? (
              <Button
                variant="link"
                color="module"
                size="sm"
                className="h-auto p-0"
                title={`Open ${filedUnder}`}
                onClick={(event) => {
                  ctx.open(
                    'crm.account.detail',
                    { id: companyId },
                    { target: event.shiftKey ? 'beside' : 'tab' }
                  );
                }}
              >
                <Icon glyph={faBuilding} className="size-3.5" aria-hidden />
                {filedUnder}
              </Button>
            ) : typedCompany !== null ? (
              <span>{typedCompany}</span>
            ) : null}
            {customer.company !== null && customer.jobTitle !== null ? <span>·</span> : null}
            {customer.jobTitle !== null ? <span>{customer.jobTitle}</span> : null}
          </Text>
          {/* The three classification axes, lifecycle first (the primary signal). */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <Badge color={lifecycleMeta.color} variant="soft" size="sm">
              {lifecycleMeta.label}
            </Badge>
            <Badge color={meta.color} variant="soft" size="sm">
              {meta.label}
            </Badge>
            {leadMeta ? (
              <Badge color={leadMeta.color} variant="soft" size="sm">
                {leadMeta.label}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {customer.doNotContact ? (
        <Alert color="warning">
          <AlertContent>
            <AlertDescription>
              Left out of marketing emails. Order and account messages still reach them.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <MetadataList layout="stack">
        {customer.email ? (
          <MetadataItem label="Email">
            <span className="break-all">{customer.email}</span>
          </MetadataItem>
        ) : null}
        {customer.phone ? <MetadataItem label="Phone">{customer.phone}</MetadataItem> : null}
        {contact ? <MetadataItem label="Best reached by">{contact}</MetadataItem> : null}
        {rep ? <MetadataItem label="Looked after by">{rep}</MetadataItem> : null}
        {account ? <MetadataItem label="Wholesale account">{account}</MetadataItem> : null}
        <MetadataItem label="Customer since">{joinedMonth(customer.createdAt)}</MetadataItem>
      </MetadataList>

      {customer.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {customer.tags.map((tag) => (
            <Badge key={tag} color="neutral" variant="soft" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}
