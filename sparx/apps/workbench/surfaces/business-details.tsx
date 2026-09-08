'use client';

// Business details — who the business IS, as a legal entity.
//
// This is the account's own record, and it is deliberately NOT a site: a
// business is "WizeWorks", registered as "WizeWorks LLC", and it may run a site
// called "sparx". Sites have their own names and brands; this is the entity
// behind them, and it is what a customer-facing DOCUMENT is issued by.
//
// Nothing here is required. A business fills it in over time, and an invoice
// renders with whatever is known rather than blocking on a field nobody set —
// so there is no validation gate, only a Save.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Combobox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Save, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api/client';
import { useDirtySource } from '../lib/workbench/dirty';
import { timezoneOptions, type TimezoneOption } from '../lib/timezones';
import { FormSection } from '../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../components/pane-toolbar';
import { EditorLayout } from '../components/editor-layout';
import type { SurfaceContext } from '../lib/surfaces/registry';

interface BusinessDetails {
  businessName: string | null;
  entityType: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  taxRegistered: boolean;
  phone: string | null;
  supportEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  defaultCurrency: string | null;
}

/** The form's own shape: every text field is a string, never null, because a
 *  controlled input cannot hold null without React complaining. Converted back
 *  at the boundary — see `toPayload`. */
type FormState = Record<Exclude<keyof BusinessDetails, 'taxRegistered'>, string> & {
  taxRegistered: boolean;
};

const EMPTY: FormState = {
  businessName: '',
  entityType: '',
  registrationNumber: '',
  taxId: '',
  taxRegistered: false,
  phone: '',
  supportEmail: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  timezone: '',
  defaultCurrency: '',
};

/** How the business is constituted. An open set on the server (jurisdictions
 *  differ), but these cover the common cases without making someone type. */
const ENTITY_TYPES = [
  { value: '', label: 'Not set' },
  { value: 'sole_trader', label: 'Sole trader / sole proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'nonprofit', label: 'Non-profit' },
  { value: 'other', label: 'Other' },
];

function toForm(data: BusinessDetails): FormState {
  return {
    businessName: data.businessName ?? '',
    entityType: data.entityType ?? '',
    registrationNumber: data.registrationNumber ?? '',
    taxId: data.taxId ?? '',
    taxRegistered: data.taxRegistered,
    phone: data.phone ?? '',
    supportEmail: data.supportEmail ?? '',
    addressLine1: data.addressLine1 ?? '',
    addressLine2: data.addressLine2 ?? '',
    city: data.city ?? '',
    region: data.region ?? '',
    postalCode: data.postalCode ?? '',
    country: data.country ?? '',
    timezone: data.timezone ?? '',
    defaultCurrency: data.defaultCurrency ?? '',
  };
}

/** Empty string means "cleared", which the API models as null — the server
 *  trims and nulls too, but sending null makes the intent explicit rather than
 *  relying on a coercion at the far end. */
function toPayload(form: FormState): Record<string, string | boolean | null> {
  const out: Record<string, string | boolean | null> = { taxRegistered: form.taxRegistered };
  for (const [key, value] of Object.entries(form)) {
    if (key === 'taxRegistered') continue;
    out[key] = typeof value === 'string' && value.trim() === '' ? null : value;
  }
  return out;
}

/** A labelled text field. The whole surface is this shape, so it's one helper
 *  rather than fifteen near-identical Field blocks. */
function TextField({
  label,
  value,
  onChange,
  description,
  placeholder,
  type = 'text',
  error,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  type?: string;
  error?: string | null;
  onBlur?: () => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldControl
        render={
          <Input
            color={error ? 'error' : 'module'}
            type={type}
            value={value}
            placeholder={placeholder}
            onBlur={onBlur}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        }
      />
      {/* The error replaces the description rather than stacking under it —
          two lines of guidance under one input is where people stop reading. */}
      {error ? (
        <FieldStatus status="error">{error}</FieldStatus>
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}

export function BusinessDetailsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const { data, isError, isPending, refetch } = useQuery({
    queryKey: ['tenant', 'business'],
    queryFn: () => api.get<BusinessDetails>('/v1/tenant/business'),
  });

  useEffect(() => {
    ctx.setTitle('Business details');
  }, [ctx]);

  // Seed once. Re-seeding on every refetch would overwrite what someone is
  // part-way through typing when a background refresh lands.
  useEffect(() => {
    if (data && !loaded) {
      setForm(toForm(data));
      setLoaded(true);
    }
  }, [data, loaded]);

  // FORMAT only. Whether an address actually receives mail is not knowable from
  // here, and refusing to save over a deliverability guess would be worse than
  // the typo. This catches "hello@" and "hello.com" — the mistakes that make a
  // support address silently unreachable.
  const emailValue = form.supportEmail.trim();
  const emailMalformed = emailValue !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  // Held until blur: validating mid-keystroke marks the field wrong before
  // anyone has finished typing the first character.
  const emailError =
    emailMalformed && emailTouched ? 'Enter an address like hello@yourbusiness.com' : null;

  const dirty =
    loaded && data !== undefined && JSON.stringify(form) !== JSON.stringify(toForm(data));
  useDirtySource(dirty, 'Your business details have unsaved changes. Close anyway?');

  const save = useMutation({
    mutationFn: () => api.patch<BusinessDetails>('/v1/tenant/business', toPayload(form)),
    onSuccess: (result) => {
      queryClient.setQueryData(['tenant', 'business'], result);
      setForm(toForm(result));
      // Invoices and purchase orders print this record — a stale copy in a
      // preview pane beside this one would show the old address.
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
      toast.add({ title: 'Business details saved', type: 'success' });
    },
    onError: () => {
      toast.add({
        title: 'Could not save',
        description: 'Nothing was changed. Check the fields and try again.',
        type: 'error',
      });
    },
  });

  const set = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ~420 zones, each needing two Intl formatters to describe — so this is keyed
  // on the SAVED zone, not the edited one. Anything the user picks came out of
  // this list already, and rebuilding it on every pick would stall the click
  // that caused it.
  const zones = useMemo(() => timezoneOptions(data?.timezone ?? null), [data?.timezone]);
  const selectedZone = zones.find((zone) => zone.value === form.timezone) ?? null;

  // A failed load is shown INSTEAD of the form, never alongside it. The form
  // seeds from `data`, so on a failed load every field renders blank — which
  // reads as "this business has filled nothing in" rather than "we could not
  // reach the server". Someone would retype their whole address into a form
  // whose Save is already dead (`dirty` needs `data`), and lose it.
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <TriangleAlert />
          <AlertContent>
            <AlertTitle>Could not load your business details</AlertTitle>
            <AlertDescription>
              Nothing has been lost — this is a problem reaching the server, not with your saved
              details.
            </AlertDescription>
          </AlertContent>
          <AlertActions>
            <Button
              size="sm"
              color="error"
              variant="soft"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </AlertActions>
        </Alert>
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Business details actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            // A malformed address blocks the save outright: the server rejects it
            // anyway, and a 400 surfaces as a generic toast that never points at
            // the field that caused it.
            disabled={!dirty || emailMalformed || isPending || save.isPending}
            onClick={() => {
              setEmailTouched(true);
              save.mutate();
            }}
          >
            <Save className="size-4" aria-hidden />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorLayout
          main={
            <>
              <FormSection
                title="Business"
                description="Who you are as a business. This is what gets printed on invoices, receipts and purchase orders — it is not the name of any of your sites."
              >
                <TextField
                  label="Business name"
                  value={form.businessName}
                  onChange={set('businessName')}
                  placeholder="WizeWorks"
                  description="The name customers know you by. It may differ from your registered company name."
                />
                <div className="grid gap-4 @lg:grid-cols-2">
                  <Field>
                    <FieldLabel>Business type</FieldLabel>
                    <NativeSelect
                      color="module"
                      aria-label="Business type"
                      value={form.entityType}
                      onChange={(event) => {
                        set('entityType')(event.target.value);
                      }}
                    >
                      {ENTITY_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <TextField
                    label="Company number"
                    value={form.registrationNumber}
                    onChange={set('registrationNumber')}
                    description="As issued when you registered the business."
                  />
                </div>
              </FormSection>

              <FormSection
                title="Address"
                description="Where the business is registered. This prints under your name on documents you send."
              >
                <TextField
                  label="Street"
                  value={form.addressLine1}
                  onChange={set('addressLine1')}
                />
                <TextField
                  label="Street line 2"
                  value={form.addressLine2}
                  onChange={set('addressLine2')}
                  placeholder="Suite, unit, floor"
                />
                <div className="grid gap-4 @lg:grid-cols-3">
                  <TextField label="City" value={form.city} onChange={set('city')} />
                  <TextField label="State / region" value={form.region} onChange={set('region')} />
                  <TextField
                    label="Postal code"
                    value={form.postalCode}
                    onChange={set('postalCode')}
                  />
                </div>
                <TextField
                  label="Country"
                  value={form.country}
                  onChange={set('country')}
                  placeholder="US"
                  description="Two-letter country code, e.g. US, GB, AU."
                />
              </FormSection>

              <FormSection
                title="Contact"
                description="How customers reach you. Shown on documents alongside your address."
              >
                <div className="grid gap-4 @lg:grid-cols-2">
                  <TextField label="Phone" value={form.phone} onChange={set('phone')} />
                  <TextField
                    label="Support email"
                    type="email"
                    value={form.supportEmail}
                    onChange={set('supportEmail')}
                    error={emailError}
                    onBlur={() => {
                      setEmailTouched(true);
                    }}
                    description="Where customers should write with a question."
                  />
                </div>
              </FormSection>
            </>
          }
          rail={
            <>
              <FormSection
                title="Tax"
                description="Only filled in if you are registered to charge tax."
              >
                <label className="flex items-center gap-2">
                  <Checkbox
                    color="module"
                    checked={form.taxRegistered}
                    aria-label="Registered for sales tax or VAT"
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, taxRegistered: event.target.checked }));
                    }}
                  />
                  <Text as="span">Registered for sales tax / VAT</Text>
                </label>
                <TextField
                  label="Tax ID"
                  value={form.taxId}
                  onChange={set('taxId')}
                  description="Your EIN, VAT, GST or ABN number."
                />
                {/* Printing a tax number you are not registered under is a
                    compliance problem, not a cosmetic one — so say plainly that
                    the toggle, not the field, decides. */}
                {form.taxId.trim() && !form.taxRegistered ? (
                  <Text className="text-warning text-sm">
                    This will not be shown on documents until you tick the box above.
                  </Text>
                ) : null}
              </FormSection>

              <FormSection title="Defaults" description="Used when nothing more specific applies.">
                <TextField
                  label="Currency"
                  value={form.defaultCurrency}
                  onChange={set('defaultCurrency')}
                  placeholder="USD"
                  description="Three-letter code, e.g. USD, GBP, AUD."
                />
                <Field>
                  <FieldLabel>Time zone</FieldLabel>
                  <Combobox
                    color="module"
                    items={zones}
                    value={selectedZone}
                    onValueChange={(next) => {
                      // Base UI carries the ITEM, not its value. Clearing yields
                      // null; the form models "unset" as an empty string, which
                      // `toPayload` turns back to null at the boundary.
                      set('timezone')(next ? (next as TimezoneOption).value : '');
                    }}
                    placeholder="Search for your city…"
                    emptyMessage="No time zone matches that city."
                    aria-label="Time zone"
                  />
                  <FieldDescription>Used for dates on documents you send.</FieldDescription>
                </Field>
              </FormSection>
            </>
          }
        />
      </div>
    </div>
  );
}
