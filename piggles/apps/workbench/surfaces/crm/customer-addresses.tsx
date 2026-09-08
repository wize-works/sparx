'use client';

// The customer's addresses — add, edit, remove, all in the pane.
//
// This is real editing, so it stays in the pane rather than a modal: a modal is
// invisible to the app's unsaved-work safety net, and there is no reason to leave
// the profile to change an address. One form is open at a time — either the "add"
// form at the top or one row swapped for its editor in place — so the section
// never becomes a wall of open forms.
//
// Each address is its own record with its own immediate write (not part of the
// customer's Save draft), which is why Save/Cancel live on the address form
// itself here, not on the pane toolbar.

import { shownInPlace } from '@wizeworks/query';
import { useState } from 'react';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldLabel,
  FieldStatus,
  Input,
  Select,
  Switch,
  Text,
} from '@wizeworks/silicaui-react';
import { faLocationDot, faPencil, faPlus, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { FormSection } from '../../components/form-section';
import { customerErrorMessage, type CustomerAddress } from './customers-data';
import {
  useAddAddress,
  useCustomerAddresses,
  useDeleteAddress,
  useUpdateAddress,
  type CustomerAddressInput,
} from './customer-attachments-data';

const TYPE_ITEMS: Record<string, string> = {
  shipping: 'Delivery',
  billing: 'Billing',
  both: 'Delivery & billing',
};

function addressTypeLabel(type: string): string {
  return TYPE_ITEMS[type] ?? 'Delivery & billing';
}

/* ── Display card ───────────────────────────────────────────────────────── */

function AddressCard({
  address,
  onEdit,
  onDelete,
  deleting,
}: {
  address: CustomerAddress;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const lines = [
    address.recipientName,
    address.company,
    address.line1,
    address.line2,
    [address.city, address.region, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter((line): line is string => Boolean(line?.trim()));

  return (
    <div className="border-base-300 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="neutral" variant="outline" size="sm">
          {addressTypeLabel(address.type)}
        </Badge>
        {address.label ? <Text className="text-sm font-semibold">{address.label}</Text> : null}
        {address.isDefault ? (
          <Badge color="success" variant="soft" size="sm">
            Default
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            color="module"
            onClick={onEdit}
            aria-label="Edit address"
          >
            <Icon glyph={faPencil} className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            color="danger"
            loading={deleting}
            onClick={onDelete}
            aria-label="Remove address"
          >
            <Icon glyph={faTrashCan} className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
      <address className="text-sm not-italic">
        {lines.map((line, index) => (
          <span key={index} className="block">
            {line}
          </span>
        ))}
      </address>
      {address.phone ? <Text className="text-sm">{address.phone}</Text> : null}
    </div>
  );
}

/* ── Editor form (inline) ───────────────────────────────────────────────── */

interface AddressDraft {
  type: 'shipping' | 'billing' | 'both';
  label: string;
  recipientName: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

function toAddressDraft(a?: CustomerAddress): AddressDraft {
  return {
    type: (a?.type as AddressDraft['type']) ?? 'shipping',
    label: a?.label ?? '',
    recipientName: a?.recipientName ?? '',
    company: a?.company ?? '',
    line1: a?.line1 ?? '',
    line2: a?.line2 ?? '',
    city: a?.city ?? '',
    region: a?.region ?? '',
    postalCode: a?.postalCode ?? '',
    country: a?.country ?? '',
    phone: a?.phone ?? '',
    isDefault: a?.isDefault ?? false,
  };
}

/** Present fields only — the server treats optionals as absent-not-null, so an
 *  empty box must be an omitted key. Required fields always go. */
function buildAddressInput(draft: AddressDraft): CustomerAddressInput {
  const clean = (value: string) => (value.trim() === '' ? undefined : value.trim());
  const optional: Partial<CustomerAddressInput> = {
    label: clean(draft.label),
    recipientName: clean(draft.recipientName),
    company: clean(draft.company),
    line2: clean(draft.line2),
    region: clean(draft.region),
    postalCode: clean(draft.postalCode),
    phone: clean(draft.phone),
  };
  // Drop the undefined keys so the payload carries only fields the person filled.
  for (const key of Object.keys(optional) as (keyof CustomerAddressInput)[]) {
    if (optional[key] === undefined) delete optional[key];
  }
  return {
    type: draft.type,
    line1: draft.line1.trim(),
    city: draft.city.trim(),
    country: draft.country.trim().toUpperCase(),
    isDefault: draft.isDefault,
    ...optional,
  };
}

function AddressForm({
  customerId,
  address,
  onDone,
  onCancel,
}: {
  customerId: string;
  address?: CustomerAddress;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isNew = !address;
  const add = useAddAddress(customerId);
  const update = useUpdateAddress(customerId);

  const [draft, setDraft] = useState<AddressDraft>(() => toAddressDraft(address));
  const [showErrors, setShowErrors] = useState(false);

  const set = <K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const line1Error = draft.line1.trim() === '' ? 'Enter the street address.' : null;
  const cityError = draft.city.trim() === '' ? 'Enter the town or city.' : null;
  const countryError = !/^[A-Za-z]{2}$/.test(draft.country.trim())
    ? 'Use the two-letter country code, like US or GB.'
    : null;
  const blocked = line1Error ?? cityError ?? countryError;

  const saving = add.isPending || update.isPending;
  const failure =
    add.isError || update.isError
      ? customerErrorMessage(add.error ?? update.error, 'Could not save this address.')
      : null;

  const submit = () => {
    if (blocked) {
      setShowErrors(true);
      return;
    }
    const input = buildAddressInput(draft);
    if (isNew) {
      add.mutate(input, { onSuccess: onDone, onError: shownInPlace });
    } else {
      update.mutate({ addressId: address.id, input }, { onSuccess: onDone, onError: shownInPlace });
    }
  };

  return (
    <div className="border-base-300 bg-base-200 flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid gap-3 @md:grid-cols-2">
        <Field>
          <FieldLabel>Kind of address</FieldLabel>
          <Select
            color="module"
            aria-label="Kind of address"
            value={draft.type}
            items={TYPE_ITEMS}
            onValueChange={(next) => {
              set('type', next as AddressDraft['type']);
            }}
          />
        </Field>
        <Field>
          <FieldLabel>Label</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.label}
                placeholder="HQ, Warehouse 2…"
                onChange={(event) => {
                  set('label', event.target.value);
                }}
              />
            }
          />
        </Field>
      </div>

      <div className="grid gap-3 @md:grid-cols-2">
        <Field>
          <FieldLabel>Recipient</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.recipientName}
                placeholder="Who it is addressed to"
                onChange={(event) => {
                  set('recipientName', event.target.value);
                }}
              />
            }
          />
        </Field>
        <Field>
          <FieldLabel>Company</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.company}
                onChange={(event) => {
                  set('company', event.target.value);
                }}
              />
            }
          />
        </Field>
      </div>

      <Field>
        <FieldLabel>Street address</FieldLabel>
        <FieldControl
          render={
            <Input
              color={line1Error && showErrors ? 'error' : 'module'}
              value={draft.line1}
              placeholder="123 Main St"
              onChange={(event) => {
                set('line1', event.target.value);
              }}
            />
          }
        />
        {line1Error && showErrors ? <FieldStatus status="error">{line1Error}</FieldStatus> : null}
      </Field>

      <Field>
        <FieldLabel>Apartment, suite, unit</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={draft.line2}
              placeholder="Optional"
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
                color={cityError && showErrors ? 'error' : 'module'}
                value={draft.city}
                onChange={(event) => {
                  set('city', event.target.value);
                }}
              />
            }
          />
          {cityError && showErrors ? <FieldStatus status="error">{cityError}</FieldStatus> : null}
        </Field>
        <Field>
          <FieldLabel>State or region</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.region}
                placeholder="Optional"
                onChange={(event) => {
                  set('region', event.target.value);
                }}
              />
            }
          />
        </Field>
      </div>

      <div className="grid gap-3 @md:grid-cols-2">
        <Field>
          <FieldLabel>Postal code</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.postalCode}
                placeholder="Optional"
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
                color={countryError && showErrors ? 'error' : 'module'}
                value={draft.country}
                placeholder="US"
                spellCheck={false}
                autoComplete="off"
                className="max-w-[8rem] font-mono uppercase"
                onChange={(event) => {
                  set('country', event.target.value.toUpperCase().slice(0, 2));
                }}
              />
            }
          />
          {countryError && showErrors ? (
            <FieldStatus status="error">{countryError}</FieldStatus>
          ) : null}
        </Field>
      </div>

      <Field>
        <FieldLabel>Phone</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              type="tel"
              value={draft.phone}
              placeholder="Optional"
              onChange={(event) => {
                set('phone', event.target.value);
              }}
            />
          }
        />
      </Field>

      <Field>
        <FieldLabel>Use as the default address</FieldLabel>
        <FieldControl
          render={
            <Switch
              color="module"
              checked={draft.isDefault}
              onCheckedChange={(next: boolean) => {
                set('isDefault', next);
              }}
            />
          }
        />
      </Field>

      {failure ? <Text className="text-error text-sm">{failure}</Text> : null}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" color="module" loading={saving} onClick={submit}>
          {isNew ? 'Add address' : 'Save address'}
        </Button>
      </div>
    </div>
  );
}

/* ── Section ────────────────────────────────────────────────────────────── */

export function CustomerAddressesSection({ customerId }: { customerId: string }) {
  const { data: addresses, isPending, isError } = useCustomerAddresses(customerId);
  const remove = useDeleteAddress(customerId);
  const confirm = useConfirm();

  // Which editor is open: a specific address id, the sentinel 'new', or none.
  const [editing, setEditing] = useState<string | null>(null);

  const onDelete = async (address: CustomerAddress) => {
    const ok = await confirm({
      title: 'Remove this address?',
      description:
        'It is taken off this customer. Past orders that used it keep their own copy, so nothing on an order changes.',
      confirmLabel: 'Remove address',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(address.id);
  };

  const rows = addresses ?? [];

  return (
    <FormSection
      title="Addresses"
      description="Where this customer's orders ship and bill to."
      action={
        editing === null ? (
          <Button
            size="sm"
            variant="outline"
            color="module"
            onClick={() => {
              setEditing('new');
            }}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Add address
          </Button>
        ) : null
      }
    >
      {editing === 'new' ? (
        <AddressForm
          customerId={customerId}
          onDone={() => {
            setEditing(null);
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      ) : null}

      {isError ? (
        <Text className="text-sm">Could not load addresses just now.</Text>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : rows.length === 0 && editing !== 'new' ? (
        <div className="flex items-center gap-2">
          <Icon glyph={faLocationDot} className="size-4 shrink-0" aria-hidden />
          <Text className="text-sm">No addresses on file yet. Add one to get started.</Text>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((address) =>
            editing === address.id ? (
              <AddressForm
                key={address.id}
                customerId={customerId}
                address={address}
                onDone={() => {
                  setEditing(null);
                }}
                onCancel={() => {
                  setEditing(null);
                }}
              />
            ) : (
              <AddressCard
                key={address.id}
                address={address}
                deleting={remove.isPending && remove.variables === address.id}
                onEdit={() => {
                  setEditing(address.id);
                }}
                onDelete={() => {
                  void onDelete(address);
                }}
              />
            )
          )}
        </div>
      )}
    </FormSection>
  );
}
