'use client';

// Connecting a mailbox (docs/144 §5.2) — its own pane, opened from the list.
//
// WHY A PANE AND NOT A DIALOG. docs/123 §"Pane or modal?" says a modal must
// clear all four tests, and this clears none of them: the app password is
// fetched from another browser tab (so it is minutes, not seconds, and the
// person needs the workbench to stay put while they go and get it), a
// half-entered credential is real work to lose, and modal state is invisible to
// `hasUnsavedWork()` — the one place in this app where work can vanish silently.
//
// AND WHY NOT INLINE EITHER, which is what this was. A form parked above the
// list sat permanently on top of the thing people came to look at, pushed the
// list down the page on every visit for the sake of an action taken once, and
// duplicated the empty state underneath itself. "Pane or modal" is the whole
// choice; a third shape wedged into the list surface is neither.
//
// THE THING THIS SURFACE HAS TO GET RIGHT is that the person doing it has never
// heard of IMAP. They know their email address and they know their password, and
// both of those facts are traps: the server names are not guessable, and their
// normal password will be rejected by every provider that has two-factor
// authentication switched on. So the form leads with "who is your email with",
// fills the technical boxes from that, and says in plain words where to find an
// app password for that specific provider.

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  mailboxErrorMessage,
  MAIL_PRESETS,
  useConnectMailbox,
  type MailPreset,
} from './mailboxes-data';

interface Draft {
  presetId: string;
  emailAddress: string;
  appPassword: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  scope: 'personal' | 'shared';
}

function draftFor(preset: MailPreset): Draft {
  return {
    presetId: preset.id,
    emailAddress: '',
    appPassword: '',
    displayName: '',
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
    scope: 'personal',
  };
}

const DEFAULT_PRESET = MAIL_PRESETS[0]!;

export function MailboxConnectSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const connect = useConnectMailbox();
  const [draft, setDraft] = useState<Draft>(() => draftFor(DEFAULT_PRESET));

  useEffect(() => {
    ctx.setTitle('Connect a mailbox');
  }, [ctx]);

  const preset = MAIL_PRESETS.find((p) => p.id === draft.presetId) ?? DEFAULT_PRESET;

  // A half-typed password is real work: closing the pane loses it, so the pane
  // has to say so before it goes.
  const touched = draft.emailAddress !== '' || draft.appPassword !== '' || draft.displayName !== '';
  useDirtySource(touched, 'You have a half-finished mailbox connection.');

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const choosePreset = (id: string) => {
    const chosen = MAIL_PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
    // Keep what the person has already typed; replace only what the provider
    // determines. Re-blanking their address because they changed provider is
    // the kind of thing that makes someone give up on a form.
    setDraft((previous) => ({
      ...previous,
      presetId: chosen.id,
      imapHost: chosen.imapHost,
      imapPort: chosen.imapPort,
      smtpHost: chosen.smtpHost,
      smtpPort: chosen.smtpPort,
    }));
  };

  const canSubmit =
    draft.emailAddress.trim() !== '' &&
    draft.appPassword !== '' &&
    draft.imapHost.trim() !== '' &&
    draft.smtpHost.trim() !== '' &&
    !connect.isPending;

  const submit = () => {
    connect.mutate(
      {
        emailAddress: draft.emailAddress.trim(),
        appPassword: draft.appPassword,
        imapHost: draft.imapHost.trim(),
        imapPort: draft.imapPort,
        smtpHost: draft.smtpHost.trim(),
        smtpPort: draft.smtpPort,
        scope: draft.scope,
        displayName: draft.displayName.trim() === '' ? null : draft.displayName.trim(),
      },
      {
        onSuccess: () => {
          // Clear the draft BEFORE closing so the dirty guard does not stop the
          // close on work that has just been committed.
          setDraft(draftFor(DEFAULT_PRESET));
          toast.add({
            title: 'Mailbox connected',
            description: 'New email will start appearing on your customers’ records.',
            type: 'success',
          });
          ctx.close();
        },
        onError: (err: unknown) => {
          toast.add({
            title: 'Could not connect that mailbox',
            description: mailboxErrorMessage(
              err,
              'Check the address and the app password, then try again.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Mailbox connection actions"
        status={
          <Text as="span" className="text-sm">
            sparx signs in once now to make sure it works.
          </Text>
        }
        controls={
          <>
            <Button color="module" size="sm" disabled={!canSubmit} onClick={submit}>
              {connect.isPending ? 'Checking…' : 'Connect mailbox'}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Card className="p-4">
          <Heading level={2} className="text-lg">
            Connect a mailbox
          </Heading>
          <Text className="mt-1">
            sparx will read new email from this account and show it on the matching customer’s
            record, and send your replies from this address.
          </Text>

          <div className="mt-4 grid gap-4 @2xl:grid-cols-2">
            <Field>
              <FieldLabel>Who is your email with?</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    color="module"
                    aria-label="Who is your email with?"
                    value={draft.presetId}
                    onChange={(event) => {
                      choosePreset(event.currentTarget.value);
                    }}
                  >
                    {MAIL_PRESETS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              <FieldDescription>
                This fills in the technical settings below so you do not have to look them up.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Email address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="email"
                    aria-label="Email address"
                    autoComplete="off"
                    placeholder="you@yourbusiness.com"
                    value={draft.emailAddress}
                    onChange={(event) => {
                      set('emailAddress', event.currentTarget.value);
                    }}
                  />
                }
              />
            </Field>

            <Field className="@2xl:col-span-2">
              <FieldLabel>App password</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="password"
                    aria-label="App password"
                    autoComplete="new-password"
                    value={draft.appPassword}
                    onChange={(event) => {
                      set('appPassword', event.currentTarget.value);
                    }}
                  />
                }
              />
              {/* The single most common reason this form fails, said before
                  they try it rather than after it is rejected. */}
              <FieldDescription>{preset.appPasswordHint}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Name recipients see</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    aria-label="Name recipients see"
                    placeholder="Dana Reed"
                    value={draft.displayName}
                    onChange={(event) => {
                      set('displayName', event.currentTarget.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Optional. Shown instead of the bare address in the customer’s inbox.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Whose mailbox is this?</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    color="module"
                    aria-label="Whose mailbox is this?"
                    value={draft.scope}
                    onChange={(event) => {
                      set('scope', event.currentTarget.value as 'personal' | 'shared');
                    }}
                  >
                    <option value="personal">Mine — my own work email</option>
                    <option value="shared">
                      A shared address the team uses (sales@, support@)
                    </option>
                  </NativeSelect>
                }
              />
            </Field>
          </div>

          {/* THE PRIVACY PROMISE, made before the credential is handed over
              rather than buried in a settings page afterwards. It is also the
              literal behaviour of the sync — see syncGateFor(). */}
          <Alert
            color={draft.scope === 'personal' ? 'info' : 'warning'}
            variant="soft"
            className="mt-4"
          >
            {draft.scope === 'personal'
              ? 'Because this is your own mailbox, sparx keeps only the messages to and from people already on your customer list. Everything else is discarded as it is read — never saved, never searchable, never visible to your team.'
              : 'A shared address is meant to receive mail from people you have not met, so sparx keeps everything that arrives here — including messages from strangers. Do not connect a personal mailbox this way.'}
          </Alert>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Server settings (already filled in)
            </summary>
            <div className="mt-3 grid gap-4 @2xl:grid-cols-2">
              <Field>
                <FieldLabel>Incoming mail server</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      aria-label="Incoming mail server"
                      value={draft.imapHost}
                      onChange={(event) => {
                        set('imapHost', event.currentTarget.value);
                      }}
                    />
                  }
                />
                {draft.imapHost.includes('://') ? (
                  <FieldError>Just the server name — no https:// in front.</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Outgoing mail server</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      aria-label="Outgoing mail server"
                      value={draft.smtpHost}
                      onChange={(event) => {
                        set('smtpHost', event.currentTarget.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}
