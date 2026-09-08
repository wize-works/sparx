'use client';

// One payment provider — set it up, and make it the one that takes payments.
//
// A provider is turned on in one of three ways, and the pane shows the right one:
//
//   • sparx Pay      — a hosted setup on Stripe's own pages. This pane can start
//                      it (and redirect you there); it finishes over there and
//                      returns you here connected. We never fake that step.
//   • Your own keys  — paste the API keys from your processor. Saving them is
//                      real work committed to the server, which is why this is a
//                      pane, not a dialog: it holds a draft and guards it.
//   • Manual         — no online processing; you mark orders paid by hand.
//
// Saved secret keys are never shown back — the form says "on file" and leaving a
// secret blank keeps whatever is already stored, exactly as the server treats it.

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
  Heading,
  Input,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { CheckCircle2, ExternalLink, Trash2 } from 'lucide-react';
import { CopyValue } from '../../components/copy-value';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  gatewayState,
  paymentsErrorMessage,
  useCaptureCredentials,
  useDeleteCredentials,
  useGatewayCatalog,
  useGatewayCredentials,
  usePaymentConfig,
  useSelectGateway,
  useStartSparxPayOnboarding,
  type GatewayDescriptor,
  type MaskedGatewayCredential,
  type PaymentConfig,
} from './providers-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function PaymentProviderDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const gatewayId = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const config = usePaymentConfig();
  const catalog = useGatewayCatalog();
  const credentials = useGatewayCredentials();

  const descriptor = (catalog.data ?? []).find((g) => g.id === gatewayId);

  useEffect(() => {
    ctx.setTitle(descriptor?.name ?? 'Payment provider');
  }, [ctx, descriptor]);

  if (config.isError || catalog.isError) {
    return (
      <div className={PANE_SHELL}>
        {/* No `noun` here, deliberately. A 404 on a provider's config means it
            has never been set up, not that somebody deleted it, so the missing
            wording would tell the wrong story. */}
        <PaneLoadError
          title="Could not load this provider"
          description={paymentsErrorMessage(
            config.error ?? catalog.error,
            'This is a problem reaching the server. Nothing has been changed.'
          )}
          onRetry={() => {
            void config.refetch();
            void catalog.refetch();
          }}
        />
      </div>
    );
  }

  if (config.isPending || catalog.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (!descriptor) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <Alert color="warning" className="max-w-md">
            <AlertContent>
              <AlertTitle>Unknown payment provider</AlertTitle>
              <AlertDescription>
                This provider is no longer part of sparx. Close this pane and pick another from the
                list.
              </AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      </div>
    );
  }

  const credential = (credentials.data ?? []).find((c) => c.gatewayId === gatewayId);

  return <ProviderEditor descriptor={descriptor} config={config.data} credential={credential} />;
}

function ProviderEditor({
  descriptor,
  config,
  credential,
}: {
  descriptor: GatewayDescriptor;
  config: PaymentConfig | undefined;
  credential: MaskedGatewayCredential | undefined;
}) {
  const state = gatewayState(descriptor, config, credential);
  const isSelected = config?.gatewayId === descriptor.id;
  const isActive = isSelected && Boolean(config?.isActive);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar label="Payment provider actions">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </PaneToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {descriptor.name}
            </Heading>
            <Text className="text-sm">{descriptor.blurb}</Text>
          </div>

          {/* Two different true sentences, because there are two different
              situations. A provider with no online checkout is switched on and
              charges nothing, and calling that "takes payments" is the screen
              telling an owner her orders are being paid when they are not. */}
          {isActive ? (
            <Alert color={descriptor.checkout === 'none' ? 'info' : 'success'} variant="soft">
              <AlertContent>
                <AlertTitle>This is your active provider</AlertTitle>
                <AlertDescription>
                  {descriptor.checkout === 'none'
                    ? `Checkout places the order and charges nothing — you mark each one paid yourself. ${descriptor.feeNote}`
                    : `Checkout uses ${descriptor.name} to take payments. ${descriptor.feeNote}`}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {descriptor.onboarding === 'manual' ? (
            <ManualBody descriptor={descriptor} isActive={isActive} />
          ) : descriptor.onboarding === 'sparx_hosted' ? (
            <SparxPayBody descriptor={descriptor} config={config} isActive={isActive} />
          ) : (
            <ApiKeysBody
              descriptor={descriptor}
              credential={credential}
              isSelected={isSelected}
              webhookUrl={config?.webhookUrls?.[descriptor.id]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Manual ─────────────────────────────────────────────────────────────── */

function ManualBody({
  descriptor,
  isActive,
}: {
  descriptor: GatewayDescriptor;
  isActive: boolean;
}) {
  const select = useSelectGateway();
  const toast = useToast();

  return (
    <FormSection
      title="Manual payments"
      description="Record check, cash, wire or bank transfer by hand. There are no card payments and no fee — you mark each order paid yourself."
    >
      {isActive ? (
        <Text className="text-sm">Manual payments are switched on for this site.</Text>
      ) : (
        <div>
          <Button
            size="sm"
            color="module"
            loading={select.isPending}
            onClick={() => {
              select.mutate(descriptor.id, {
                onSuccess: () => {
                  toast.add({ title: 'Manual payments switched on', type: 'success' });
                },
                onError: (error) => {
                  toast.add({
                    title: 'Could not switch that on',
                    description: paymentsErrorMessage(error, 'Nothing was changed.'),
                    type: 'error',
                  });
                },
              });
            }}
          >
            Use manual payments
          </Button>
        </div>
      )}
    </FormSection>
  );
}

/* ── sparx Pay (hosted) ─────────────────────────────────────────────────── */

function SparxPayBody({
  descriptor,
  config,
  isActive,
}: {
  descriptor: GatewayDescriptor;
  config: PaymentConfig | undefined;
  isActive: boolean;
}) {
  const onboard = useStartSparxPayOnboarding();
  const toast = useToast();
  const sparxPay = config?.sparxPay;
  const started = Boolean(sparxPay?.accountId);

  const start = () => {
    const returnUrl = typeof window !== 'undefined' ? window.location.href : '';
    onboard.mutate(
      { returnUrl, refreshUrl: returnUrl },
      {
        onSuccess: ({ url }) => {
          if (typeof window !== 'undefined') window.location.href = url;
        },
        onError: (error) => {
          toast.add({
            title: 'Could not start setup',
            description: paymentsErrorMessage(
              error,
              'sparx Pay is not available on this environment yet. Nothing was changed.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection title="Set up sparx Pay" description={descriptor.feeNote}>
      {isActive ? (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="text-success size-4" aria-hidden />
            Ready to take card payments
          </span>
          <Text className="text-sm">
            Payouts and payment history are managed on sparx&apos;s hosted dashboard.
          </Text>
        </div>
      ) : (
        <>
          <Text className="text-sm">
            {started
              ? 'You started setting up sparx Pay but it is not finished. Continue where you left off — it opens on a secure page and brings you back here when it is done.'
              : 'Setup takes a few minutes on a secure page (bank details and identity checks). You will be brought back here when it is finished.'}
          </Text>
          {sparxPay && started && !sparxPay.detailsSubmitted ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>Details still needed</AlertTitle>
                <AlertDescription>
                  sparx Pay is waiting on the rest of your details before it can take payments.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
          <div>
            <Button size="sm" color="module" loading={onboard.isPending} onClick={start}>
              <ExternalLink className="size-4" aria-hidden />
              {started ? 'Continue setup' : 'Set up sparx Pay'}
            </Button>
          </div>
        </>
      )}
    </FormSection>
  );
}

/* ── Bring-your-own keys ────────────────────────────────────────────────── */

interface KeyDraft {
  fields: Record<string, string>;
  environment: 'sandbox' | 'production';
}

function initialDraft(
  descriptor: GatewayDescriptor,
  credential: MaskedGatewayCredential | undefined
): KeyDraft {
  const fields: Record<string, string> = {};
  for (const field of descriptor.credentialFields) {
    if (!field.secret) fields[field.key] = credential?.publicMeta[field.key] ?? '';
  }
  return { fields, environment: credential?.environment ?? 'production' };
}

function requiredFilled(
  descriptor: GatewayDescriptor,
  draft: KeyDraft,
  credential: MaskedGatewayCredential | undefined
): boolean {
  for (const field of descriptor.credentialFields) {
    if (field.optional) continue;
    const value = draft.fields[field.key]?.trim() ?? '';
    if (field.secret) {
      if (!value && !credential?.hasSecrets) return false;
    } else if (!value) {
      return false;
    }
  }
  return true;
}

function ApiKeysBody({
  descriptor,
  credential,
  isSelected,
  webhookUrl,
}: {
  descriptor: GatewayDescriptor;
  credential: MaskedGatewayCredential | undefined;
  isSelected: boolean;
  webhookUrl: string | undefined;
}) {
  // The name of the company whose dashboard she opens in the other tab. The
  // shelf name is a different thing and is wrong in a possessive — see
  // GatewayDescriptor.processor.
  const processorName = descriptor.processor ?? descriptor.name;
  const capture = useCaptureCredentials();
  const select = useSelectGateway();
  const remove = useDeleteCredentials();
  const confirm = useConfirm();
  const toast = useToast();

  // Local draft — re-seeded whenever the saved credential changes (e.g. after a
  // save invalidates and refetches), unless the operator is mid-edit.
  const saved = useMemo(() => initialDraft(descriptor, credential), [descriptor, credential]);
  const [draft, setDraft] = useState<KeyDraft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useDirtySource(touched, `Your ${processorName} keys have unsaved changes. Close anyway?`);

  const setField = (key: string, value: string) => {
    setTouched(true);
    setDraft((current) => ({ ...current, fields: { ...current.fields, [key]: value } }));
  };

  const setEnvironment = (environment: 'sandbox' | 'production') => {
    setTouched(true);
    setDraft((current) => ({ ...current, environment }));
  };

  const canSave = touched && requiredFilled(descriptor, draft, credential);

  const onSave = () => {
    capture.mutate(
      { gatewayId: descriptor.id, environment: draft.environment, fields: draft.fields },
      {
        onSuccess: () => {
          setTouched(false);
          toast.add({ title: `${processorName} keys saved`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save those keys',
            description: paymentsErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onMakeActive = () => {
    select.mutate(descriptor.id, {
      onSuccess: () => {
        toast.add({ title: `${descriptor.name} is now your active provider`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not switch provider',
          description: paymentsErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onRemove = () => {
    void (async () => {
      const ok = await confirm({
        title: `Remove your ${processorName} keys?`,
        description:
          'Your saved keys are deleted and this provider can no longer take payments until you enter them again. Any orders already taken are unaffected. This cannot be undone.',
        confirmLabel: 'Remove the keys',
        cancelLabel: 'Keep them',
        color: 'danger',
      });
      if (!ok) return;
      remove.mutate(descriptor.id, {
        onSuccess: () => {
          setTouched(false);
          setDraft(initialDraft(descriptor, undefined));
          afterPaneChange(() => {
            toast.add({ title: `${processorName} keys removed`, type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not remove those keys',
            description: paymentsErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  return (
    <>
      <FormSection
        title="Your keys"
        description={`Paste these from your ${processorName} account. Saved keys are never shown again — leave a key blank to keep the one already saved.`}
      >
        {descriptor.environments ? (
          <Field>
            <FieldLabel>Which keys are these?</FieldLabel>
            <FieldControl
              render={
                <div className="max-w-xs">
                  <Select
                    color="module"
                    aria-label="Which keys are these?"
                    value={draft.environment}
                    items={[
                      { value: 'production', label: 'Live (real payments)' },
                      { value: 'sandbox', label: 'Test (sandbox)' },
                    ]}
                    onValueChange={(next) => {
                      setEnvironment((next as 'sandbox' | 'production') ?? 'production');
                    }}
                  />
                </div>
              }
            />
          </Field>
        ) : null}

        {descriptor.credentialFields.map((field) => {
          const onFile = field.secret && credential?.hasSecrets;
          return (
            <Field key={field.key}>
              <FieldLabel>
                {field.label}
                {field.optional ? ' (optional)' : ''}
              </FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.fields[field.key] ?? ''}
                    placeholder={
                      onFile ? '•••••••• saved — leave blank to keep' : field.placeholder
                    }
                    onChange={(event) => {
                      setField(field.key, event.target.value);
                    }}
                  />
                }
              />
              {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
            </Field>
          );
        })}

        {descriptor.docsUrl ? (
          <Text className="text-sm">
            Not sure where to find these? They are in your {processorName} account settings.
          </Text>
        ) : null}

        <div className="flex justify-end">
          <Button
            color="module"
            size="sm"
            loading={capture.isPending}
            disabled={!canSave}
            onClick={onSave}
          >
            {credential?.hasSecrets ? 'Save changes' : 'Save keys'}
          </Button>
        </div>
      </FormSection>

      {webhookUrl ? (
        <FormSection
          title={`Tell ${processorName} where to send updates`}
          description={`Add this address in your ${processorName} account so it can tell us when a payment goes through. Until you do, cards will still be charged — but orders will keep showing as unpaid and your customers won't get a receipt.`}
        >
          <CopyValue value={webhookUrl} label="webhook address" />
          <Text className="text-sm">
            In Stripe: Developers → Webhooks → Add endpoint. Paste the address above, then choose
            these updates: successful payments, failed payments, refunds, and disputes. Stripe then
            shows you a signing secret — paste that into the <strong>Webhook signing secret</strong>{' '}
            field above.
          </Text>
        </FormSection>
      ) : null}

      <FormSection title="Use this provider">
        {isSelected ? (
          <Text className="text-sm">
            {credential?.hasSecrets
              ? 'This is your active provider.'
              : 'This is your chosen provider — save your keys above to start taking payments.'}
          </Text>
        ) : credential?.hasSecrets ? (
          <div className="flex flex-col gap-2">
            <Text className="text-sm">
              Your keys are saved, but checkout is still using another provider. Make this the one
              that takes payments:
            </Text>
            <div>
              <Button size="sm" color="module" loading={select.isPending} onClick={onMakeActive}>
                Make this my active provider
              </Button>
            </div>
          </div>
        ) : (
          <Text className="text-sm">
            Save your keys above first, then you can make this your active provider.
          </Text>
        )}
      </FormSection>

      {credential?.hasSecrets ? (
        <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Text className="text-sm">Removing your keys stops this provider taking payments.</Text>
          <Button
            size="sm"
            variant="outline"
            color="danger"
            loading={remove.isPending}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove keys
          </Button>
        </div>
      ) : null}
    </>
  );
}
