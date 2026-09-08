'use client';

// Email settings — the sending identity for THIS site.
//
// One form, one Save, last-write-wins — the platform's explicit-save rule. There
// is nothing to publish and nothing to stage: what you save is what the next
// email sends as. An unsaved edit registers the leave-guard, so closing or
// switching sites with pending changes asks first.
//
// This is a small form with no companion summary, so it is a single capped,
// centred column — NOT EditorLayout, which would strand a near-empty rail beside
// it. Grouping carries the structure: who it comes from, what it sends through,
// and the mailing address the law requires.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  Loading,
  NativeSelect,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Save, TriangleAlert } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  emailSettingsErrorMessage,
  useEmailSettings,
  useSendingDomains,
  useUpdateEmailSettings,
  type EmailSettings,
} from './settings-data';

/** The form's own shape: every field a string, because a controlled input can't
 *  hold null. Converted back at the boundary in `toPayload`. */
interface FormState {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  physicalAddress: string;
  /** '' = send through sparx's shared address. */
  defaultSendingDomainId: string;
}

const EMPTY: FormState = {
  fromName: '',
  fromAddress: '',
  replyTo: '',
  physicalAddress: '',
  defaultSendingDomainId: '',
};

function toForm(data: EmailSettings): FormState {
  return {
    fromName: data.fromName ?? '',
    fromAddress: data.fromAddress ?? '',
    replyTo: data.replyTo ?? '',
    physicalAddress: data.physicalAddress ?? '',
    defaultSendingDomainId: data.defaultSendingDomainId ?? '',
  };
}

/** Empty string means "cleared", which the API models as null. Trimmed here so a
 *  field of only spaces reads as unset rather than saving whitespace. */
function toPayload(form: FormState): Record<string, string | null> {
  const clean = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    fromName: clean(form.fromName),
    fromAddress: clean(form.fromAddress),
    replyTo: clean(form.replyTo),
    physicalAddress: clean(form.physicalAddress),
    defaultSendingDomainId: form.defaultSendingDomainId === '' ? null : form.defaultSendingDomainId,
  };
}

// FORMAT only. Whether an address receives mail is not knowable here; this
// catches "hello@" and "hello.com" — the mistakes that make replies vanish.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function malformedEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && !EMAIL_RE.test(trimmed);
}

/** A labelled text field. The whole form is this shape, so it's one helper. */
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
      {error ? (
        <FieldStatus status="error">{error}</FieldStatus>
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}

export function EmailSettingsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const settings = useEmailSettings();
  const domains = useSendingDomains();
  const save = useUpdateEmailSettings();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState<{ fromAddress: boolean; replyTo: boolean }>({
    fromAddress: false,
    replyTo: false,
  });

  useEffect(() => {
    ctx.setTitle('Email settings');
  }, [ctx]);

  // Seed once. Re-seeding on a background refetch would overwrite what someone is
  // part-way through typing.
  const data = settings.data;
  useEffect(() => {
    if (data && !loaded) {
      setForm(toForm(data));
      setLoaded(true);
    }
  }, [data, loaded]);

  const set = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const fromAddressError =
    touched.fromAddress && malformedEmail(form.fromAddress)
      ? 'Enter an address like hello@yourbusiness.com'
      : null;
  const replyToError =
    touched.replyTo && malformedEmail(form.replyTo)
      ? 'Enter an address like hello@yourbusiness.com'
      : null;
  const hasFormatError = malformedEmail(form.fromAddress) || malformedEmail(form.replyTo);

  const dirty =
    loaded && data !== undefined && JSON.stringify(form) !== JSON.stringify(toForm(data));
  useDirtySource(dirty, 'Your email settings have unsaved changes. Close anyway?');

  // The picker's options: the shared default, then this site's domains. A
  // verified domain is selectable; anything not yet proven is shown but disabled,
  // because sending through it would bounce. A previously-saved domain that isn't
  // in the fetched window is appended so the current choice never disappears.
  const domainOptions = useMemo(() => {
    const items = domains.data?.items ?? [];
    const known = new Set(items.map((d) => d.id));
    const extra =
      form.defaultSendingDomainId && !known.has(form.defaultSendingDomainId)
        ? [{ id: form.defaultSendingDomainId, domain: 'Current selection', state: 'verified' }]
        : [];
    return [...items, ...extra];
  }, [domains.data, form.defaultSendingDomainId]);

  function onSave() {
    setTouched({ fromAddress: true, replyTo: true });
    if (hasFormatError) return;
    save.mutate(toPayload(form), {
      onSuccess: (result) => {
        setForm(toForm(result));
        toast.add({ title: 'Email settings saved', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save',
          description: emailSettingsErrorMessage(
            error,
            'Nothing was changed. Check the fields and try again.'
          ),
          type: 'error',
        });
      },
    });
  }

  // A failed load is shown INSTEAD of the form. The form seeds from `data`, so on
  // a failed load every field renders blank — which reads as "nothing is set"
  // rather than "we couldn't reach the server", and someone would retype their
  // whole identity into a form whose Save is already dead (`dirty` needs `data`).
  if (settings.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <TriangleAlert />
          <AlertContent>
            <AlertTitle>Could not load your email settings</AlertTitle>
            <AlertDescription>
              Nothing has been lost — this is a problem reaching the server, not with your saved
              settings.
            </AlertDescription>
          </AlertContent>
          <AlertActions>
            <Button
              size="sm"
              color="error"
              variant="soft"
              onClick={() => {
                void settings.refetch();
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
        label="Email settings actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!dirty || hasFormatError || settings.isPending || save.isPending}
            onClick={onSave}
          >
            <Save className="size-4" aria-hidden />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {settings.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loading />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <FormSection
              title="Who your email comes from"
              description="This is what your customers see in their inbox, and where their replies go."
            >
              <TextField
                label="Sender name"
                value={form.fromName}
                onChange={set('fromName')}
                placeholder="Acme Supply"
                description="The name shown in the inbox — usually your business name, not a person."
              />
              <div className="grid gap-4 @lg:grid-cols-2">
                <TextField
                  label="From address"
                  type="email"
                  value={form.fromAddress}
                  onChange={set('fromAddress')}
                  error={fromAddressError}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, fromAddress: true }));
                  }}
                  placeholder="hello@yourbusiness.com"
                  description="The address your email is sent from. Leave blank to use sparx's shared address."
                />
                <TextField
                  label="Reply-to address"
                  type="email"
                  value={form.replyTo}
                  onChange={set('replyTo')}
                  error={replyToError}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, replyTo: true }));
                  }}
                  placeholder="support@yourbusiness.com"
                  description="Where a customer's reply lands, if it's different from the address above."
                />
              </div>
            </FormSection>

            <FormSection
              title="Which address you send through"
              description="Sending through an address you've proven you own helps your email reach the inbox instead of the spam folder."
            >
              <Field>
                <FieldLabel>Send through</FieldLabel>
                <NativeSelect
                  color="module"
                  aria-label="Sending address"
                  value={form.defaultSendingDomainId}
                  onChange={(event) => {
                    set('defaultSendingDomainId')(event.target.value);
                  }}
                >
                  <option value="">sparx&apos;s shared sending address</option>
                  {domainOptions.map((domain) => (
                    <option
                      key={domain.id}
                      value={domain.id}
                      disabled={domain.state !== 'verified'}
                    >
                      {domain.state === 'verified'
                        ? domain.domain
                        : `${domain.domain} — not verified yet`}
                    </option>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  {domains.isError
                    ? "Your sending addresses couldn't be loaded, so only the shared address is available right now. You can still save the rest of this page."
                    : 'Add and verify your own addresses under Sending addresses. Only verified ones can be chosen here.'}
                </FieldDescription>
              </Field>
            </FormSection>

            <FormSection
              title="Your mailing address"
              description="Anti-spam laws (like the US CAN-SPAM Act) require a real physical mailing address in every email you send to a list. A PO box or registered office address is fine. Without one, your email is far more likely to be blocked or marked as spam."
            >
              <Field>
                <FieldLabel>Mailing address</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={4}
                      value={form.physicalAddress}
                      placeholder={
                        'Acme Supply\n123 Main Street\nSpringfield, IL 62704\nUnited States'
                      }
                      onChange={(event) => {
                        set('physicalAddress')(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  This appears in small print at the bottom of every email, alongside an unsubscribe
                  link.
                </FieldDescription>
              </Field>
            </FormSection>
          </div>
        )}
      </div>
    </div>
  );
}
