'use client';

// One company — create it, then manage it.
//
// Create and manage are the same surface: `{ id: 'new' }` builds it, `{ id }`
// manages it. A company is an ORGANISATION this business deals with — who they
// are, which email addresses are theirs, who on your team owns the relationship,
// and which of your contacts work there. If the `b2b` module is on it is also a
// trading partner, and the terms of that trade appear; if it is not, none of
// them do, because a credit limit on a dental practice is not a blank field, it
// is the wrong question.
//
// This is an editable entity, so its name is a field at the top, not a repeated
// read-only heading. Removing a company is rare, irreversible and admin-only, so
// it sits in a quiet row after the work.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Select,
  Table,
  TagInput,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useModuleStates } from '../../lib/api/shell-data';
import { CustomPropertiesPanel } from './custom-properties-panel';
import { AssociationsPanel } from './associations-panel';
import { customerName, lifecycleStageMeta, useCustomers } from './customers-data';
import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { ModuleScope } from '../../components/module-scope';
import {
  formatMoney as formatInvoiceMoney,
  normalizeDocument,
  invoiceState,
  type BillingDocument,
} from '../invoicing/types';
import { formatMoney as formatDealMoney, useDeals } from './deals-data';
import { stageTypeMeta } from './pipelines-data';
import { priorityLabel, priorityTone, useTickets } from './tickets-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useTeamRoster } from '../../lib/api/team';
import { useViewer } from '../../lib/api/shell-data';
import { PaymentTermsField } from '../../components/payment-terms-field';
import { SaveFailure } from '@/components/save-failure';
import {
  ACCOUNT_STATUSES,
  accountErrorMessage,
  accountStatusMeta,
  formatMoney,
  useAccount,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
  type AccountInput,
  type Company,
  type CompanyStatus,
} from './companies-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  companyName: string;
  website: string;
  /** Comma- or newline-separated while being typed; split on save. Kept as raw
   *  text rather than a chip list so someone pasting three domains out of a
   *  spreadsheet gets what they expect instead of one chip with commas in it. */
  domains: string;
  taxId: string;
  status: CompanyStatus;
  creditLimit: string;
  paymentTerms: string;
  discountPercent: string;
  pricingTier: string;
  assignedRepId: string;
  fleetSize: string;
  notes: string;
  tags: string[];
  /** The extra details THIS business tracks (docs/144 §3). Shape is per-tenant. */
  customProperties: Record<string, unknown>;
}

function emptyDraft(): Draft {
  return {
    companyName: '',
    website: '',
    domains: '',
    taxId: '',
    status: 'active',
    creditLimit: '',
    paymentTerms: '',
    discountPercent: '',
    pricingTier: '',
    assignedRepId: '',
    fleetSize: '',
    notes: '',
    tags: [],
    customProperties: {},
  };
}

/** Split what somebody typed into domains, tolerantly. Commas, spaces and
 *  newlines all separate, an `@` prefix and a `www.` are dropped, and a pasted
 *  URL keeps only its host — because all four of those are what people actually
 *  type, and rejecting them would be a form arguing with someone who told it
 *  exactly what it needed to know. */
export function splitDomains(raw: string): string[] {
  const seen = new Set<string>();
  for (const piece of raw.split(/[\s,;]+/)) {
    const cleaned = piece
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^@/, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    if (cleaned) seen.add(cleaned);
  }
  return [...seen];
}

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** The first thing typed that is not a domain, said in words rather than a regex. */
function firstBadDomain(raw: string): string | null {
  const bad = splitDomains(raw).find((d) => !DOMAIN_RE.test(d));
  return bad ? `"${bad}" does not look like a domain — try something like acme.com` : null;
}

function numberOrEmpty(value: string): string {
  return value.trim();
}

function toDraft(a: Company): Draft {
  const credit = Number(a.creditLimit);
  const discount = Number(a.discountPercent);
  return {
    companyName: a.companyName,
    website: a.website ?? '',
    domains: (a.domains ?? []).join(', '),
    taxId: a.taxId ?? '',
    status: (a.status as CompanyStatus) ?? 'active',
    creditLimit: credit > 0 ? String(credit) : '',
    paymentTerms: a.paymentTerms ?? '',
    discountPercent: discount > 0 ? String(discount) : '',
    pricingTier: a.pricingTier ?? '',
    assignedRepId: a.assignedRepId ?? '',
    fleetSize: a.fleetSize === null ? '' : String(a.fleetSize),
    notes: a.notes ?? '',
    tags: a.tags,
    customProperties: a.customProperties ?? {},
  };
}

const trimOrNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const URL_RE = /^https?:\/\/.+\..+/i;

/* ── Surface ────────────────────────────────────────────────────────────── */

export function CompanyDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CompanyEditor ctx={ctx} id="new" /> : <CompanyLoader ctx={ctx} id={id} />;
}

function CompanyLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: account, isPending, isError, error, refetch } = useAccount(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="company"
        title="Could not load this company"
        description="This is a problem reaching the server, or the account has been removed. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !account) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <CompanyEditor ctx={ctx} id={id} account={account} />;
}

function CompanyEditor({
  ctx,
  id,
  account,
}: {
  ctx: SurfaceContext;
  id: string;
  account?: Company;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateAccount();
  const update = useUpdateAccount(id);
  const remove = useDeleteAccount(id);

  const { members } = useTeamRoster();
  const { data: viewer } = useViewer();
  const canDelete = viewer?.role === 'admin' || viewer?.role === 'owner';

  const saved = useMemo(() => (account ? toDraft(account) : emptyDraft()), [account]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New company' : account ? account.companyName : 'Company');
  }, [ctx, isNew, account]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This company has not been created yet. Close anyway?'
      : 'This company has unsaved changes. Close anyway?'
  );

  const repItems = useMemo(() => {
    const items: Record<string, string> = { '': 'No one assigned' };
    for (const m of members) items[m.userId] = m.name ?? m.email;
    if (draft.assignedRepId && !items[draft.assignedRepId]) {
      items[draft.assignedRepId] = 'A former team member';
    }
    return items;
  }, [members, draft.assignedRepId]);

  /* ── Validation ───────────────────────────────────────────────────────── */

  const nameError = draft.companyName.trim() === '' ? 'Give the business a name.' : null;
  const websiteError =
    draft.website.trim() !== '' && !URL_RE.test(draft.website.trim())
      ? 'Enter a full web address, starting with http:// or https://.'
      : null;
  const creditError =
    draft.creditLimit.trim() !== '' && !(Number(draft.creditLimit) >= 0)
      ? 'Enter the credit limit as a number, or leave it blank for none.'
      : null;
  const discountError =
    draft.discountPercent.trim() !== '' &&
    !(Number(draft.discountPercent) >= 0 && Number(draft.discountPercent) <= 100)
      ? 'Enter a discount between 0 and 100.'
      : null;
  // Trade terms — credit, payment days, discount, price tier, fleet — render
  // ONLY for a business that sells on account (docs/144 §11). A design agency
  // tracking the firms it works with should never meet a credit limit, and a
  // form that shows one teaches them this is a wholesale tool.
  //
  // The fields keep their values while hidden. That is deliberate: turning the
  // module on next month should reveal whatever an import already wrote, not a
  // form that quietly dropped it.
  const modules = useModuleStates();
  const tradeEnabled = (modules.data ?? []).some((m) => m.slug === 'b2b' && m.enabled);

  const domainError = firstBadDomain(draft.domains);
  const blocked = nameError ?? websiteError ?? domainError ?? creditError ?? discountError;

  const failure =
    create.isError || update.isError
      ? accountErrorMessage(
          create.error ?? update.error,
          'The server did not answer. Nothing was changed and your work is still on screen — try again in a moment.'
        )
      : null;

  /* ── Build + submit ───────────────────────────────────────────────────── */

  const buildInput = (): AccountInput => ({
    companyName: draft.companyName.trim(),
    website: trimOrNull(draft.website),
    domains: splitDomains(draft.domains),
    taxId: trimOrNull(draft.taxId),
    pricingTier: trimOrNull(draft.pricingTier),
    status: draft.status,
    creditLimit: draft.creditLimit.trim() === '' ? 0 : Number(draft.creditLimit),
    discountPercent: draft.discountPercent.trim() === '' ? 0 : Number(draft.discountPercent),
    paymentTerms: draft.paymentTerms || null,
    assignedRepId: draft.assignedRepId || null,
    fleetSize: draft.fleetSize.trim() === '' ? null : Number(draft.fleetSize),
    notes: trimOrNull(draft.notes),
    tags: draft.tags,
    customProperties: draft.customProperties,
  });

  const submit = () => {
    if (blocked) return;
    const input = buildInput();

    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('crm.account.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${created.companyName} added`, type: 'success' });
          });
        },
      });
      return;
    }

    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Company saved', type: 'success' });
      },
    });
  };

  const onDelete = async () => {
    if (!account) return;
    const ok = await confirm({
      title: `Remove ${account.companyName}?`,
      description:
        'This takes the company out of your lists. Its past orders and history are kept for your records, and the people who work there stay as customers. You can add it again later.',
      confirmLabel: 'Remove this company',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${account.companyName} removed`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this company',
          description: accountErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const meta = accountStatusMeta(draft.status);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Company actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={saving}
            disabled={Boolean(blocked) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Add company' : 'Save'}
          </Button>
        }
        controls={
          <>
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
            {tradeEnabled && account && Number(account.creditUsed) > 0 ? (
              <Text as="span" className="hidden shrink-0 text-sm @md:inline">
                {formatMoney(account.creditUsed)} of {formatMoney(account.creditLimit)} used
              </Text>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Add a company
              </Heading>
              <Text>
                Set up a business that buys from you at agreed prices. You can add its buyers as
                customers afterwards.
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this company" message={failure} />

          <FormSection title="The business">
            <Field>
              <FieldLabel>Company name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.companyName}
                    placeholder="Rivera Fabrication"
                    onChange={(event) => {
                      set('companyName', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? <FieldStatus status="error">{nameError}</FieldStatus> : null}
            </Field>

            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Website</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color={websiteError && touched ? 'error' : 'module'}
                      value={draft.website}
                      placeholder="https://rivera.example"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        set('website', event.target.value);
                      }}
                    />
                  }
                />
                {websiteError && touched ? (
                  <FieldStatus status="error">{websiteError}</FieldStatus>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Tax number</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.taxId}
                      placeholder="Optional"
                      autoComplete="off"
                      onChange={(event) => {
                        set('taxId', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Their VAT or tax registration number, if you need it on documents.
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel>Their email domains</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={domainError && touched ? 'error' : 'module'}
                    value={draft.domains}
                    placeholder="rivera.example, rivera-group.example"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      set('domains', event.target.value);
                    }}
                  />
                }
              />
              {domainError && touched ? (
                <FieldStatus status="error">{domainError}</FieldStatus>
              ) : null}
              <FieldDescription>
                When someone new is added with an email address at one of these, we&rsquo;ll suggest
                putting them under this company — we never do it for you. Separate several with
                commas. Leave it blank if their people use personal addresses.
              </FieldDescription>
            </Field>
          </FormSection>

          {tradeEnabled ? (
            <FormSection
              title="Trade terms"
              description="What this business is allowed to order on account, and what it pays."
            >
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  color="module"
                  aria-label="Company status"
                  value={draft.status}
                  items={Object.fromEntries(
                    ACCOUNT_STATUSES.map((s) => [s, accountStatusMeta(s).label])
                  )}
                  onValueChange={(next) => {
                    set('status', next as CompanyStatus);
                  }}
                />
                <FieldDescription>{meta.description}</FieldDescription>
              </Field>

              <div className="grid gap-3 @md:grid-cols-2">
                <Field>
                  <FieldLabel>Credit limit</FieldLabel>
                  <FieldControl
                    render={
                      <div className="flex max-w-[12rem] items-center gap-2">
                        <Text as="span" className="text-lg">
                          $
                        </Text>
                        <Input
                          color={creditError && touched ? 'error' : 'module'}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={draft.creditLimit}
                          placeholder="0.00"
                          onChange={(event) => {
                            set('creditLimit', numberOrEmpty(event.target.value));
                          }}
                        />
                      </div>
                    }
                  />
                  {creditError && touched ? (
                    <FieldStatus status="error">{creditError}</FieldStatus>
                  ) : (
                    <FieldDescription>
                      The most they can owe you on account at once. Leave blank for none.
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Discount</FieldLabel>
                  <FieldControl
                    render={
                      <div className="flex max-w-[10rem] items-center gap-2">
                        <Input
                          color={discountError && touched ? 'error' : 'module'}
                          type="number"
                          min={0}
                          max={100}
                          inputMode="decimal"
                          value={draft.discountPercent}
                          placeholder="0"
                          onChange={(event) => {
                            set('discountPercent', numberOrEmpty(event.target.value));
                          }}
                        />
                        <Text as="span" className="text-lg">
                          %
                        </Text>
                      </div>
                    }
                  />
                  {discountError && touched ? (
                    <FieldStatus status="error">{discountError}</FieldStatus>
                  ) : (
                    <FieldDescription>
                      Taken off your normal prices for this company.
                    </FieldDescription>
                  )}
                </Field>
              </div>

              <div className="grid gap-3 @md:grid-cols-2">
                <Field>
                  <FieldLabel>Payment terms</FieldLabel>
                  <PaymentTermsField
                    value={draft.paymentTerms}
                    onChange={(next) => {
                      set('paymentTerms', next);
                    }}
                  />
                  <FieldDescription>
                    How long they have to pay after you invoice them.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Price tier</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={draft.pricingTier}
                        placeholder="Optional"
                        onChange={(event) => {
                          set('pricingTier', event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    A named group your price lists can point at, if you use them.
                  </FieldDescription>
                </Field>
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Your side of it">
            <Field>
              <FieldLabel>Looked after by</FieldLabel>
              <Select
                color="module"
                aria-label="Which team member looks after this company"
                value={draft.assignedRepId}
                items={repItems}
                onValueChange={(next) => {
                  set('assignedRepId', next as string);
                }}
              />
              <FieldDescription>
                The person on your team who owns this relationship.
              </FieldDescription>
            </Field>

            {/* FLEET SIZE IS A TRADE FIELD, AND AN INDUSTRY-SPECIFIC ONE. It
                exists because a supplier selling to hauliers holds stock against
                how many machines a customer runs, and `b2b_fleet_holds` keys off
                it. Asked of a caterer or a dental practice it is not merely
                blank, it is a question about their business that assumes the
                wrong business — so it arrives with the `b2b` module and leaves
                with it, like every other term below the same line. */}
            {tradeEnabled ? (
              <Field>
                <FieldLabel>Fleet size</FieldLabel>
                <FieldControl
                  render={
                    <div className="max-w-[10rem]">
                      <Input
                        color="module"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={draft.fleetSize}
                        placeholder="Optional"
                        onChange={(event) => {
                          set('fleetSize', numberOrEmpty(event.target.value));
                        }}
                      />
                    </div>
                  }
                />
                <FieldDescription>
                  If this business runs vehicles or machines you hold stock against, how many. Leave
                  blank if it does not apply.
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
                Your own words for grouping accounts. Letters, numbers, - and _ only.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Notes</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={draft.notes}
                    placeholder="Anything worth remembering about this company — only your team sees it."
                    onChange={(event) => {
                      set('notes', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          {/* WHO WORKS HERE. Not the same thing as the panel below it: this is
              every contact whose employer IS this company (`companyId`), which is
              what the domain offer sets and what the list's People count counts.
              Without it the pane contradicted its own list — "1 person" on one
              screen, "nothing is linked to this yet" on the next. */}
          {!isNew && account ? <CompanyPeople companyId={account.id} ctx={ctx} /> : null}
          {!isNew && account ? <CompanyRelated companyId={account.id} ctx={ctx} /> : null}

          {/* Everything else connected to this company — the group it belongs to,
              a deal it is the client on, whoever signs its paperwork (docs/144
              §6). Writes immediately, so it is only offered once it exists. */}
          {!isNew && account ? (
            <AssociationsPanel
              objectKey="company"
              recordId={account.id}
              ctx={ctx}
              title="Linked to this company"
            />
          ) : null}

          {/* The extra details this business tracks on a company (docs/144 §3).
              Renders nothing until they declare some. */}
          <CustomPropertiesPanel
            objectKey="company"
            values={draft.customProperties}
            onChange={(next) => {
              set('customProperties', next);
            }}
          />

          {!isNew && account ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                {canDelete
                  ? 'Removing takes this company out of your lists. Its history is kept.'
                  : 'Only an owner or admin can remove a company.'}
              </Text>
              {canDelete ? (
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
                  Remove this company
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The people whose employer is this company.
 *
 * This is `customer.companyId`, not the association graph — the same link the
 * domain offer sets when a new contact writes in from one of the company's
 * addresses, and the same one the list counts under People. A company that
 * cannot show you its own people is a filing cabinet with the drawer welded
 * shut: the reason anybody opens a company is to find who they were dealing
 * with there.
 *
 * Stage rides each row because "who at this client is still just a lead" is the
 * question a company view is scanned for, and it is the one thing a name and an
 * email cannot tell you.
 */
/**
 * What the company owes, what is in flight with them, and what they have asked
 * for — the three questions a company record was silently unable to answer.
 *
 * A company knew who worked there and nothing else. Its invoices, its deals and
 * its support requests all existed, all carried a `company_id`, and all were
 * filterable on the API already; there was simply no screen that asked. So the
 * pane could show a trade account with a £40k credit limit and give no hint that
 * they were £12k overdue on it, which is the single fact that decides whether
 * you take the next order.
 *
 * Read-only on purpose, like every related list in the CRM: a row opens the real
 * record. This is a lens onto those things, never a second place to edit them.
 */
function CompanyRelated({ companyId, ctx }: { companyId: string; ctx: SurfaceContext }) {
  const open = (surface: string, id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    const target: OpenTarget = event.altKey ? 'window' : event.shiftKey ? 'beside' : 'tab';
    ctx.open(surface, { id }, { target });
  };

  const invoices = useQuery({
    queryKey: ['invoicing', 'documents', { companyId }],
    queryFn: () =>
      api
        .list<BillingDocument>('/v1/invoicing/documents', {
          companyId,
          sort_by: 'createdAt',
          order: 'desc',
          take: 50,
        })
        .then((result) => ({ items: result.items.map(normalizeDocument) })),
  });
  const deals = useDeals({ companyId, take: 50 });
  const tickets = useTickets({ companyId, state: 'all', take: 50 });

  const invoiceRows = invoices.data?.items ?? [];
  const dealRows = deals.data?.items ?? [];
  const ticketRows = tickets.data?.items ?? [];

  // What is still owed across everything unpaid. The number an owner is looking
  // for is rarely one invoice — it is "how exposed am I to this company".
  const owed = invoiceRows.reduce((sum, doc) => sum + doc.balance, 0);
  const owedCurrency = invoiceRows[0]?.currency ?? 'USD';
  const unpaidCount = invoiceRows.filter((doc) => doc.balance > 0).length;

  return (
    <>
      <FormSection
        title="What they owe"
        description="Everything billed to this company or to anyone who works here, newest first — because a contact's unpaid invoice is still this company's debt."
      >
        <ModuleScope module="invoicing">
          {invoices.isPending ? (
            <Text className="text-sm" role="status">
              Loading&hellip;
            </Text>
          ) : invoiceRows.length === 0 ? (
            <Text className="text-sm">
              Nothing has been billed to this company yet. Raise an invoice from Invoicing and pick
              them as the customer.
            </Text>
          ) : (
            <div className="flex flex-col gap-3">
              {owed > 0 ? (
                <Alert color="warning">
                  <AlertContent>
                    <AlertTitle>
                      {formatInvoiceMoney(owed, owedCurrency)} outstanding
                      {unpaidCount === 1
                        ? ' on one document'
                        : ` across ${String(unpaidCount)} documents`}
                    </AlertTitle>
                  </AlertContent>
                </Alert>
              ) : null}
              <Table size="sm" hover>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((doc) => {
                    const state = invoiceState(doc.status);
                    return (
                      <tr
                        key={doc.id}
                        className="cursor-pointer"
                        onClick={(event) => {
                          open('invoicing.invoice.edit', doc.id, event);
                        }}
                      >
                        <td className="font-mono text-sm">{doc.number ?? 'Draft'}</td>
                        <td>
                          <Badge color={state.tone} variant={state.tone && 'soft'} size="sm">
                            {state.label}
                          </Badge>
                        </td>
                        <td className="text-right font-mono text-sm tabular-nums">
                          {formatInvoiceMoney(doc.total, doc.currency)}
                        </td>
                        <td className="text-right font-mono text-sm tabular-nums">
                          {formatInvoiceMoney(doc.balance, doc.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </ModuleScope>
      </FormSection>

      <FormSection title="Deals" description="Sales being worked with this company.">
        {deals.isPending ? (
          <Text className="text-sm" role="status">
            Loading&hellip;
          </Text>
        ) : dealRows.length === 0 ? (
          <Text className="text-sm">No deals with this company yet.</Text>
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Stage</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {dealRows.map((deal) => {
                const meta = stageTypeMeta(deal.stage?.stageType ?? 'open');
                return (
                  <tr
                    key={deal.id}
                    className="cursor-pointer"
                    onClick={(event) => {
                      open('crm.deal.detail', deal.id, event);
                    }}
                  >
                    <td className="font-medium">{deal.title}</td>
                    <td>
                      <Badge color={meta.tone} variant="soft" size="sm">
                        {deal.stage?.name ?? meta.label}
                      </Badge>
                    </td>
                    <td className="text-right font-mono text-sm tabular-nums">
                      {formatDealMoney(deal.value, deal.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </FormSection>

      <FormSection
        title="Requests"
        description="Support this company has asked for, open and resolved."
      >
        {tickets.isPending ? (
          <Text className="text-sm" role="status">
            Loading&hellip;
          </Text>
        ) : ticketRows.length === 0 ? (
          <Text className="text-sm">Nobody here has raised a request.</Text>
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th className="w-16 text-right">#</th>
                <th>Request</th>
                <th>Urgency</th>
                <th className="hidden @lg:table-cell">Stage</th>
              </tr>
            </thead>
            <tbody>
              {ticketRows.map((row) => (
                <tr
                  key={row.ticket.id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    open('crm.ticket.detail', row.ticket.id, event);
                  }}
                >
                  <td className="text-right text-sm tabular-nums">{row.ticket.number}</td>
                  <td className="font-medium">{row.ticket.subject}</td>
                  <td>
                    <Badge color={priorityTone(row.ticket.priority)} variant="soft" size="sm">
                      {priorityLabel(row.ticket.priority)}
                    </Badge>
                  </td>
                  <td className="hidden text-sm @lg:table-cell">{row.ticket.stage?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </FormSection>
    </>
  );
}

function CompanyPeople({ companyId, ctx }: { companyId: string; ctx: SurfaceContext }) {
  const { data, isPending } = useCustomers({ companyId });
  const people = data?.items ?? [];

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }): void => {
    const target: OpenTarget = event.altKey ? 'window' : event.shiftKey ? 'beside' : 'tab';
    ctx.open('crm.customer.detail', { id }, { target });
  };

  return (
    <FormSection
      title="People here"
      description="Everyone whose employer is this company. Open one to see their history."
    >
      {isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : people.length === 0 ? (
        <Text className="text-sm">
          Nobody is filed under this company yet. Open a contact and set their company, or add this
          company&rsquo;s email domains above and new arrivals will be offered it automatically.
        </Text>
      ) : (
        <ul className="flex flex-col gap-1">
          {people.map((person) => {
            const stage = lifecycleStageMeta(person.lifecycleStage);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className="hover:bg-base-200 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left"
                  onClick={(event) => {
                    open(person.id, event);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{customerName(person)}</span>
                    {person.jobTitle !== null && person.jobTitle !== '' ? (
                      <span className="block text-sm">{person.jobTitle}</span>
                    ) : null}
                  </span>
                  {person.email !== null ? (
                    <span className="hidden text-sm @md:block">{person.email}</span>
                  ) : null}
                  <Badge color={stage.color} variant="soft" size="sm">
                    {stage.label}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </FormSection>
  );
}
