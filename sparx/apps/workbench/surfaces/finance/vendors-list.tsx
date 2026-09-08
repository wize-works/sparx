'use client';

// WHO YOU PAY — the businesses and people money goes out to, with spend-to-date.
//
// A vendor is ARCHIVED, never deleted. Someone you paid last year is a payee on
// last year's records; removing them would blank the "who did we pay" column on
// every cost that named them, which is precisely the information an accountant
// asks for. Archiving hides them from the pickers and leaves history intact.
//
// A VENDOR IS NOT A SUPPLIER, AND NOT A COMPANY — but it can be linked to both.
// The stock module's supplier is who you buy goods from; the CRM company is a
// business you have a relationship with. The landlord is neither, and the parts
// wholesaler is all three. The row shows the link when there is one, so nobody
// has to wonder whether they are looking at two records for one business.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FieldControl,
  FieldLabel,
  Heading,
  Input,
  SearchInput,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Archive, Building2, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import {
  spendErrorMessage,
  useArchiveVendor,
  useSaveVendor,
  useVendors,
  type Vendor,
} from './spend-data';
import { formatCents } from './format';

interface FormState {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  accountRef: string;
  paymentTerms: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  accountRef: '',
  paymentTerms: '',
  notes: '',
};

function formFrom(vendor: Vendor): FormState {
  return {
    name: vendor.name,
    email: vendor.email ?? '',
    phone: vendor.phone ?? '',
    website: vendor.website ?? '',
    address: vendor.address ?? '',
    accountRef: vendor.accountRef ?? '',
    paymentTerms: vendor.paymentTerms ?? '',
    notes: vendor.notes ?? '',
  };
}

function VendorEditor({ vendor, onDone }: { vendor: Vendor | null; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveVendor(vendor?.id ?? null);
  const [form, setForm] = useState<FormState>(() => (vendor ? formFrom(vendor) : EMPTY));

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const canSave = form.name.trim() !== '';
  const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim());

  const onSave = () => {
    if (!canSave) return;
    save.mutate(
      {
        name: form.name.trim(),
        email: blankToNull(form.email),
        phone: blankToNull(form.phone),
        website: blankToNull(form.website),
        address: blankToNull(form.address),
        accountRef: blankToNull(form.accountRef),
        paymentTerms: blankToNull(form.paymentTerms),
        notes: blankToNull(form.notes),
      },
      {
        onSuccess: () => {
          onDone();
          afterPaneChange(() => {
            toast.add({
              title: vendor ? `${form.name.trim()} saved` : `${form.name.trim()} added`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection
      title={vendor ? `Edit ${vendor.name}` : 'Add someone you pay'}
      action={
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label="Cancel"
          onClick={onDone}
        >
          <X className="size-4" aria-hidden />
        </Button>
      }
    >
      <div className="grid gap-3 @md:grid-cols-2">
        <Field className="@md:col-span-2">
          <FieldLabel required>Name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={form.name}
                placeholder="Northside Parts"
                onChange={(event) => {
                  set('name', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="email"
                value={form.email}
                spellCheck={false}
                placeholder="accounts@northside.com"
                onChange={(event) => {
                  set('email', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field>
          <FieldLabel>Phone</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={form.phone}
                placeholder="(555) 010-0100"
                onChange={(event) => {
                  set('phone', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field>
          <FieldLabel>Your account number with them</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={form.accountRef}
                spellCheck={false}
                placeholder="NS-4471"
                onChange={(event) => {
                  set('accountRef', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field>
          <FieldLabel>How you pay them</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={form.paymentTerms}
                placeholder="net 30"
                onChange={(event) => {
                  set('paymentTerms', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field className="@md:col-span-2">
          <FieldLabel>Address</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={form.address}
                placeholder="12 Trade Park Way, Springfield"
                onChange={(event) => {
                  set('address', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field className="@md:col-span-2">
          <FieldLabel>Notes</FieldLabel>
          <FieldControl
            render={
              <Textarea
                color="module"
                rows={2}
                value={form.notes}
                placeholder="Who to ask for, delivery days, discount arrangement…"
                onChange={(event) => {
                  set('notes', event.target.value);
                }}
              />
            }
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!canSave}
          loading={save.isPending}
          onClick={onSave}
        >
          <Save className="size-4" aria-hidden />
          {vendor ? 'Save' : 'Add them'}
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </FormSection>
  );
}

export function VendorsListSurface() {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useVendors({
    withSpend: true,
    includeArchived: showArchived,
  });
  const archive = useArchiveVendor();

  const vendors = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = data ?? [];
    const matched =
      term === ''
        ? rows
        : rows.filter(
            (vendor) =>
              vendor.name.toLowerCase().includes(term) ||
              (vendor.email ?? '').toLowerCase().includes(term) ||
              (vendor.accountRef ?? '').toLowerCase().includes(term)
          );
    // Biggest spend first: the list's job is to answer "where is the money
    // going", and alphabetical answers a question nobody asked.
    return [...matched].sort((a, b) => (b.spendCents ?? 0) - (a.spendCents ?? 0));
  }, [data, search]);

  const totalSpend = useMemo(
    () => (data ?? []).reduce((sum, vendor) => sum + (vendor.spendCents ?? 0), 0),
    [data]
  );

  const toggleArchive = async (vendor: Vendor) => {
    const archiving = vendor.archivedAt === null;
    if (archiving) {
      const ok = await confirm({
        title: `Archive ${vendor.name}?`,
        description:
          'They stop appearing when you record a cost. Every cost that already names them keeps doing so, and their spend history is untouched. You can bring them back at any time.',
        confirmLabel: 'Archive them',
        cancelLabel: 'Keep them active',
        color: 'danger',
      });
      if (!ok) return;
    }
    archive.mutate(
      { id: vendor.id, archived: archiving },
      {
        onSuccess: () => {
          afterPaneChange(() => {
            toast.add({
              title: archiving ? `${vendor.name} archived` : `${vendor.name} is active again`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Vendor list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search who you pay"
              placeholder="Search by name, email or account…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        controls={
          <>
            <Button
              size="sm"
              color="module"
              onClick={() => {
                setAdding(true);
                setEditing(null);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
            <div className="flex items-center gap-2">
              <Switch
                id="vendors-show-archived"
                color="module"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <label htmlFor="vendors-show-archived" className="text-sm whitespace-nowrap">
                Include archived
              </label>
            </div>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Building2 className="size-6" aria-hidden />}
            title="Could not load who you pay"
            description="The server could not be reached. Your records are unaffected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {(data.length > 0 || adding) && totalSpend > 0 ? (
              <Card className="p-4">
                <Text className="text-sm">Paid out, all time</Text>
                <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCents(totalSpend)}
                </Heading>
                <Text className="mt-1 text-sm">
                  across {data.length === 1 ? '1 payee' : `${String(data.length)} payees`}
                </Text>
              </Card>
            ) : null}

            {adding ? (
              <VendorEditor
                vendor={null}
                onDone={() => {
                  setAdding(false);
                }}
              />
            ) : null}

            {vendors.length === 0 && !adding ? (
              <Card>
                <ListEmptyState
                  filtered={search.trim() !== ''}
                  noResults={{
                    icon: <Building2 className="size-6" aria-hidden />,
                    title: 'Nobody matches that',
                    description:
                      'Try part of a name, an email, or the account number you have with them.',
                    actions: (
                      <Button
                        size="sm"
                        variant="outline"
                        color="neutral"
                        onClick={() => {
                          setSearch('');
                        }}
                      >
                        Clear search
                      </Button>
                    ),
                  }}
                  firstRun={{
                    icon: <Building2 className="size-6" aria-hidden />,
                    title: 'Nobody recorded yet',
                    description:
                      'Add the businesses and people you pay — a parts wholesaler, a landlord, a subcontractor — and every cost can name one. Then this list tells you where the money actually goes.',
                    actions: (
                      <Button
                        size="sm"
                        color="module"
                        onClick={() => {
                          setAdding(true);
                        }}
                      >
                        <Plus className="size-4" aria-hidden />
                        Add someone you pay
                      </Button>
                    ),
                  }}
                />
              </Card>
            ) : null}

            {vendors.map((vendor) =>
              editing === vendor.id ? (
                <VendorEditor
                  key={vendor.id}
                  vendor={vendor}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              ) : (
                <Card
                  key={vendor.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text className="font-medium">{vendor.name}</Text>
                      {vendor.archivedAt ? (
                        <Badge color="neutral" variant="soft" size="sm">
                          Archived
                        </Badge>
                      ) : null}
                      {vendor.supplierId ? (
                        <Badge color="module-inventory" variant="soft" size="sm">
                          Also a supplier
                        </Badge>
                      ) : null}
                      {vendor.companyId ? (
                        <Badge color="module-crm" variant="soft" size="sm">
                          Also a company
                        </Badge>
                      ) : null}
                    </div>
                    <Text className="text-sm">
                      {[
                        vendor.email,
                        vendor.phone,
                        vendor.accountRef ? `Account ${vendor.accountRef}` : null,
                        vendor.paymentTerms,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No contact details recorded'}
                    </Text>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Text className="font-medium tabular-nums">
                        {formatCents(vendor.spendCents ?? 0)}
                      </Text>
                      <Text className="text-sm">paid to date</Text>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      color="neutral"
                      shape="square"
                      aria-label={`Edit ${vendor.name}`}
                      onClick={() => {
                        setEditing(vendor.id);
                        setAdding(false);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      color={vendor.archivedAt ? 'success' : 'danger'}
                      shape="square"
                      aria-label={
                        vendor.archivedAt ? `Bring ${vendor.name} back` : `Archive ${vendor.name}`
                      }
                      onClick={() => {
                        void toggleArchive(vendor);
                      }}
                    >
                      {vendor.archivedAt ? (
                        <RotateCcw className="size-4" aria-hidden />
                      ) : (
                        <Archive className="size-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                </Card>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
