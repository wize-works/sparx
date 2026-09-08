'use client';

// One sending address — add it, prove you own it, make it your default, remove it.
//
// Add and manage are the SAME surface, because adding does not finish the job:
// it creates a PENDING address whose DNS records still have to be added at a
// domain provider, and this pane is what you come back to until it verifies. The
// `id === 'new'` branch is just this pane before the address exists — so it is a
// pane, not a modal: there IS a durable thing to return to and the records ARE
// the point of the screen, which fails two of the modal tests outright.
//
// Deliberately NOT built on EditorLayout. There is no running summary to put
// beside a form — this is a status, an address, and a set of records to copy. So:
// one centred column, the address as the identity, the records as the hero.
//
// The audience owns a business, not a mail server. Nothing here says "SPF",
// "DKIM" or "DMARC" without saying what it DOES in the same breath, and every
// value is presented as a thing to copy rather than a thing to understand.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useState } from 'react';
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
import { faArrowsRotate, faPlus, faStar, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { CopyValue } from '../../components/copy-value';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  emailDomainErrorMessage,
  recordPurpose,
  regionLabel,
  sendingDomainState,
  useDeleteSendingDomain,
  useEmailSettings,
  useProvisionSendingDomain,
  useSendingDomain,
  useSetDefaultSendingDomain,
  useVerifySendingDomain,
  type DnsRecord,
  type SendingDomain,
  type SendingRegion,
} from './domains-data';
import { productCopy, productCopyWith } from '../../lib/product';
import { SaveFailure } from '@/components/save-failure';

/** The one column everything in this pane sits in — centred and capped, because
 *  a pane torn onto a second monitor is otherwise 2000px of dead grey. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const REGION_OPTIONS: { value: SendingRegion; label: string }[] = [
  { value: 'us', label: 'United States' },
  { value: 'eu', label: 'Europe' },
];

/**
 * One DNS record as a labelled block rather than a table row. A three-column
 * table puts two long, unbreakable strings side by side, unreadable the moment
 * the pane is less than full width — and panes here are routinely half a screen.
 * Stacked and labelled, it survives any width and each value gets room.
 */
function RecordBlock({ record }: { record: DnsRecord }) {
  return (
    <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="neutral" variant="outline" size="sm">
          {record.recordType.toUpperCase()}
        </Badge>
        <Text className="text-sm">{recordPurpose(record)}</Text>
      </div>
      <div className="grid gap-2 @md:grid-cols-[5rem_minmax(0,1fr)] @md:items-center">
        <Text className="text-sm font-semibold">Name</Text>
        <CopyValue value={record.name} label={`${record.recordType} name`} />
        <Text className="text-sm font-semibold">Value</Text>
        <CopyValue value={record.value} label={`${record.recordType} value`} />
        {record.priority !== undefined ? (
          <>
            <Text className="text-sm font-semibold">Priority</Text>
            <CopyValue value={record.priority} label={`${record.recordType} priority`} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ── Add ────────────────────────────────────────────────────────────────── */

function AddSendingAddress({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const provision = useProvisionSendingDomain();

  const [domain, setDomain] = useState('');
  const [region, setRegion] = useState<SendingRegion>('us');

  useEffect(() => {
    ctx.setTitle('Add a sending address');
  }, [ctx]);

  const trimmed = domain.trim();
  useDirtySource(
    trimmed !== '' && !provision.isSuccess,
    'This sending address has not been added yet. Close anyway?'
  );

  // A light check only — the server owns the authoritative rule and returns the
  // exact sentence to show ("Enter a valid domain, e.g. mail.yourstore.com.").
  const looksValid = /^[^\s.]+(\.[^\s.]+)+$/.test(trimmed);

  const submit = () => {
    if (trimmed === '' || !looksValid) return;
    provision.mutate(
      { domain: trimmed.toLowerCase(), region },
      {
        onSuccess: (created) => {
          // Becomes the setup view for the address that now exists — its DNS
          // records are the next thing needed, and they live on that pane. The
          // toast follows the pane swap rather than sharing its commit.
          ctx.open('email.domains.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${created.domain} added`,
              description: 'Now add the records shown to your domain provider.',
              type: 'success',
            });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  const failure = provision.isError
    ? emailDomainErrorMessage(provision.error, 'Could not add that address. Nothing was changed.')
    : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Add a sending address actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={provision.isPending}
            disabled={trimmed === '' || !looksValid}
            onClick={submit}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Add address
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            {productCopy(
              'email.domain.addIntro',
              'Use a domain you own so your email goes out from your own address — like hello@yourbusiness.com — instead of a generic Piggles one. After you add it, we give you a few records to put at your domain provider to prove it is yours.'
            )}
          </Text>

          <SaveFailure title="Could not add that address" message={failure} />

          <FormSection title="The address">
            <Field>
              <FieldLabel>Domain</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={trimmed !== '' && !looksValid ? 'error' : 'module'}
                    value={domain}
                    placeholder="mail.yourbusiness.com"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setDomain(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submit();
                    }}
                  />
                }
              />
              {trimmed !== '' && !looksValid ? (
                <FieldStatus status="error">
                  Enter a domain like mail.yourbusiness.com — no https:// and no trailing slash.
                </FieldStatus>
              ) : (
                <FieldDescription>
                  A domain or sub-domain you own. Many businesses use a sub-domain such as
                  mail.yourbusiness.com so their main website is left untouched.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Where your email is handled</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-xs">
                    <Select
                      color="module"
                      aria-label="Where your email is handled"
                      value={region}
                      items={REGION_OPTIONS}
                      onValueChange={(next) => {
                        setRegion((next as SendingRegion | null) ?? 'us');
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>
                The region your email is processed in. Most businesses use United States. This
                cannot be changed later, so choose Europe only if you specifically need it.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="What happens after this">
            <Text className="text-sm">
              We give you a short list of records to add at your domain provider — the company you
              bought the domain from, such as GoDaddy, Namecheap or Cloudflare. Once they are in,
              press Check now and the address becomes ready to send from.
            </Text>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/* ── Manage ─────────────────────────────────────────────────────────────── */

function ManageSendingAddress({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const {
    data: domain,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useSendingDomain(id);
  const emailSettings = useEmailSettings();
  const settings = emailSettings.data;

  const verify = useVerifySendingDomain(id);
  const setDefault = useSetDefaultSendingDomain(id);
  const remove = useDeleteSendingDomain(id);

  useEffect(() => {
    if (domain) ctx.setTitle(domain.domain);
  }, [ctx, domain]);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="address"
            title="Could not load this address"
            description="This is a problem reaching the server. The address itself is unaffected."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !domain) {
    return <PaneWaiting />;
  }

  const state = sendingDomainState(domain);
  const isVerified = domain.state === 'verified';
  const isDefault = settings?.defaultSendingDomainId === domain.id;

  const onCheck = () => {
    verify.mutate(undefined, {
      onSuccess: (updated: SendingDomain) => {
        if (updated.state === 'verified') {
          toast.add({
            title: `${updated.domain} is verified`,
            description: productCopy(
              'email.domain.verified',
              'Piggles can send your email from this address now.'
            ),
            type: 'success',
          });
        } else {
          // Not an error — the records just are not visible yet. The most
          // specific true thing is shown in the page alert, not a toast.
          toast.add({
            title: 'Records not found yet',
            description:
              'DNS changes can take a while to spread. Give it a few minutes and check again.',
            type: 'info',
          });
        }
      },
      onError: (error) => {
        toast.add({
          title: 'Could not check the records',
          description: emailDomainErrorMessage(error, 'Try again shortly.'),
          type: 'error',
        });
      },
    });
  };

  const onSetDefault = () => {
    setDefault.mutate(undefined, {
      onSuccess: () => {
        toast.add({
          title: `${domain.domain} is now your default`,
          description: 'This site sends its email from this address unless told otherwise.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not set the default',
          description: emailDomainErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Remove ${domain.domain}?`,
      description: isDefault
        ? productCopyWith(
            'email.domain.removeDefault',
            `This is the address this site sends from by default. Removing it means email falls back to a generic Piggles address until you set another. Email you have already sent is unaffected. This cannot be undone.`,
            {}
          )
        : `This site will no longer be able to send email from ${domain.domain}. Email you have already sent is unaffected. This cannot be undone.`,
      confirmLabel: 'Remove this address',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${domain.domain} removed`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this address',
          description: emailDomainErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const checkFailure =
    verify.isError && verify.error
      ? emailDomainErrorMessage(verify.error, 'We could not check the records just now.')
      : null;

  const addedOn = new Date(domain.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={PANE_SHELL}>
      {/* `wrap` because this bar carries a variable set of lifecycle actions —
          which appear depends on the address's state — so there is no fixed set
          to reduce to one line. */}
      <PaneToolbar
        label="Sending address actions"
        refresh={
          <RefreshButton
            isFetching={isFetching || emailSettings.isFetching}
            updatedAt={domain ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
              void emailSettings.refetch();
            }}
          />
        }
        status={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {isDefault ? (
              <Badge color="module" variant="soft" size="sm">
                Default here
              </Badge>
            ) : null}
            <div className="flex-1" />
          </>
        }
        primary={
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            aria-label="Remove this address"
            title="Remove this address"
            loading={remove.isPending}
            onClick={() => {
              void onDelete();
            }}
          >
            <Icon glyph={faTrashCan} className="size-4" aria-hidden />
          </Button>
        }
        controls={
          <>
            {isVerified ? null : (
              <Button size="sm" color="module" loading={verify.isPending} onClick={onCheck}>
                <Icon glyph={faArrowsRotate} className="size-4" aria-hidden />
                Check now
              </Button>
            )}
            {isVerified && !isDefault ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={setDefault.isPending}
                onClick={onSetDefault}
              >
                <Icon glyph={faStar} className="size-4" aria-hidden />
                Use as default
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* The address IS the identity of this pane, and the pane TAB carries
              it — so the body opens with the two facts about it instead. */}
          <Text className="text-sm">
            {regionLabel(domain.region)} ·{' '}
            {domain.verifiedAt
              ? `Verified ${new Date(domain.verifiedAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}`
              : `Added ${addedOn}`}
          </Text>

          {/* ONE status message, carrying the most specific true thing known. A
              failed check names the exact problem, which beats the generic
              description of the same state. */}
          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>{checkFailure ?? state.detail}</AlertDescription>
            </AlertContent>
          </Alert>

          {domain.dnsRecords.length > 0 ? (
            <FormSection
              title="Records to add at your domain provider"
              description="Your domain provider is whoever you bought the domain from — GoDaddy, Namecheap, Cloudflare and so on. Find the DNS or Records screen there and add these exactly as shown to prove you own this address."
            >
              {domain.dnsRecords.map((record) => (
                <RecordBlock key={`${record.recordType}-${record.name}`} record={record} />
              ))}

              <Text className="text-sm">
                Changes at a domain provider take a few minutes to spread across the internet —
                occasionally up to a few hours. If Check now does not find them straight away, it is
                worth waiting and trying again before changing anything.
              </Text>
            </FormSection>
          ) : (
            <FormSection title="No records to add">
              <Text className="text-sm">
                There are no DNS records to add for this address right now. If you have just added
                it, try refreshing in a moment.
              </Text>
            </FormSection>
          )}

          {/* Setting the default is a normal action, not destructive — but it
              only makes sense once the address is verified, so it lives here as
              a plain row rather than crowding the toolbar for pending domains. */}
          {isVerified ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                {isDefault
                  ? 'This site sends its email from this address by default.'
                  : 'Make this the address this site sends its email from by default.'}
              </Text>
              {isDefault ? (
                <Badge color="success" variant="soft" size="sm">
                  Default for this site
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  loading={setDefault.isPending}
                  onClick={onSetDefault}
                >
                  <Icon glyph={faStar} className="size-4" aria-hidden />
                  Use as default
                </Button>
              )}
            </div>
          ) : null}

          {/* Remove — a plain row after the work, under a divider. A rare,
              irreversible action does not get equal weight with the setup. */}
          <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Text className="text-sm">
              Stop sending from this address. Email you have already sent is kept.
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
              Remove address
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SendingDomainDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? (
    <AddSendingAddress ctx={ctx} />
  ) : (
    <ManageSendingAddress ctx={ctx} id={id} />
  );
}
