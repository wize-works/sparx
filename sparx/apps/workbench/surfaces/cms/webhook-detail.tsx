'use client';

// One webhook — set it up, then manage it.
//
// Setting up and managing are the SAME surface in two states. `{ id: 'new' }`
// collects an address and the events to listen for; `{ id }` edits and pauses
// it. Making "new" a separate modal would mean building the same form twice and
// keeping the two in sync forever — so it is one pane, per the workbench rule.
//
// Explicit-save only: one Save button, last write wins. An unsaved edit
// registers the leave-guard, so closing or navigating away asks first.
//
// THE ONE-TIME SECRET. Creating a webhook is the only moment the server ever
// returns the full signing secret. So create does NOT immediately swap to the
// manage view — it stays in this pane and shows the secret with a copy button
// first, because a `replace` would fetch the record back with the secret already
// redacted and the real value gone for good. Once it is copied, "Manage" swaps
// to the edit state of the same pane.
//
// NOT built on EditorLayout: a real form, but no real second column to summarise
// — status is a toolbar badge, not a running rail — so a bento would float an
// empty rail beside the work. One centred, capped column with the fields as the
// hero.

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Copy, Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  formatDateTime,
  useCreateWebhook,
  useDeleteWebhook,
  useUpdateWebhook,
  useWebhook,
  webhookErrorMessage,
  webhookState,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_GROUPS,
  type WebhookEventKey,
  type WebhookSubscription,
} from './webhooks-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function WebhookDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CreateWebhook ctx={ctx} /> : <EditWebhook ctx={ctx} id={id} />;
}

/* ── The shared draft + field body ──────────────────────────────────────── */

interface Draft {
  name: string;
  url: string;
  events: Set<string>;
  active: boolean;
}

function serializeDraft(draft: Draft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    url: draft.url.trim(),
    events: [...draft.events].sort(),
    active: draft.active,
  });
}

/** Everything both the create and the manage views collect. */
function WebhookFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const toggleEvent = (key: string, checked: boolean) => {
    const next = new Set(draft.events);
    if (checked) next.add(key);
    else next.delete(key);
    onChange({ events: next });
  };

  return (
    <>
      <FormSection
        title="Where to send notifications"
        description="A message is sent to this address every time one of the events below happens."
      >
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.name}
                placeholder="e.g. Notify our order system"
                onChange={(event) => {
                  onChange({ name: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>
            A short name so you can tell your webhooks apart. Just for you — it is never sent
            anywhere.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Address to notify</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                className="font-mono text-sm"
                value={draft.url}
                placeholder="https://example.com/hooks/sparx"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  onChange({ url: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>
            The web address we send each notification to. Whoever is building on your content
            provides this — it has to start with https://.
          </FieldDescription>
        </Field>
      </FormSection>

      <FormSection
        title="What should trigger a notification?"
        description="Pick one or more. A message is sent every time one of the events you tick happens."
      >
        {WEBHOOK_EVENT_GROUPS.map((group) => (
          <fieldset key={group} className="flex flex-col gap-3">
            <legend className="font-medium">{group}</legend>
            {WEBHOOK_EVENTS.filter((event) => event.group === group).map((event) => (
              <label key={event.key} className="flex items-start gap-3">
                <Checkbox
                  color="module"
                  className="mt-1 shrink-0"
                  checked={draft.events.has(event.key)}
                  aria-label={event.label}
                  onChange={(changed) => {
                    toggleEvent(event.key, changed.target.checked);
                  }}
                />
                <span className="flex min-w-0 flex-col">
                  <Text as="span" className="font-medium">
                    {event.label}
                  </Text>
                  <Text as="span" className="text-sm">
                    {event.description}
                  </Text>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        {draft.events.size === 0 ? (
          <Text className="text-warning text-sm">
            Nothing is ticked, so there would be nothing to notify about. Choose at least one.
          </Text>
        ) : null}
      </FormSection>

      <FormSection
        title="Sending"
        description="Pause a webhook to stop notifications without deleting it."
      >
        <Field>
          <FieldLabel>Send notifications</FieldLabel>
          <FieldControl
            render={
              <Switch
                color="module"
                checked={draft.active}
                onCheckedChange={(next: boolean) => {
                  onChange({ active: next });
                }}
              />
            }
          />
          <FieldDescription>
            On, notifications are sent as events happen. Off, the webhook is paused and nothing is
            sent — handy while whoever receives them is still setting things up.
          </FieldDescription>
        </Field>
      </FormSection>
    </>
  );
}

/* ── The signing-secret box ─────────────────────────────────────────────── */

/** The secret value in a monospace box. `onCopy` is present only when the value
 *  is the real, full secret (creation) — copying a redacted preview is
 *  pointless, so the button simply isn't there on the manage view. */
function SecretBox({ value, onCopy }: { value: string; onCopy?: () => void }) {
  return (
    <div className="border-base-300 bg-base-200 flex items-center gap-2 rounded-md border p-3">
      <code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
      {onCopy ? (
        <Button size="sm" variant="soft" color="module" className="shrink-0" onClick={onCopy}>
          <Copy className="size-4" aria-hidden />
          Copy
        </Button>
      ) : null}
    </div>
  );
}

/* ── Create ─────────────────────────────────────────────────────────────── */

function CreateWebhook({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateWebhook();

  const [draft, setDraft] = useState<Draft>({
    name: '',
    url: '',
    events: new Set<string>(),
    active: true,
  });
  const [created, setCreated] = useState<{ id: string; name: string; secret: string } | null>(null);

  useEffect(() => {
    ctx.setTitle('New webhook');
  }, [ctx]);

  const dirty =
    created === null &&
    (draft.name.trim() !== '' || draft.url.trim() !== '' || draft.events.size > 0);
  useDirtySource(dirty, 'You have started setting up a webhook you have not saved. Close anyway?');

  const canCreate = draft.name.trim() !== '' && draft.url.trim() !== '' && draft.events.size > 0;

  const failure = create.isError
    ? webhookErrorMessage(create.error, 'Could not create this webhook. Nothing was saved.')
    : null;

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    if (!canCreate) return;
    create.mutate(
      {
        name: draft.name.trim(),
        url: draft.url.trim(),
        events: [...draft.events] as WebhookEventKey[],
        active: draft.active,
      },
      {
        onSuccess: (row) => {
          setCreated({ id: row.id, name: row.name, secret: row.signingSecret });
        },
      }
    );
  };

  const copySecret = () => {
    if (!created) return;
    void navigator.clipboard.writeText(created.secret).then(
      () => {
        toast.add({ title: 'Signing secret copied', type: 'success' });
      },
      () => {
        toast.add({
          title: 'Could not copy',
          description: 'Select the secret and copy it manually.',
          type: 'error',
        });
      }
    );
  };

  const goManage = () => {
    if (!created) return;
    ctx.open('cms.webhooks.detail', { id: created.id }, { target: 'replace' });
  };

  // Post-create: the one and only chance to see the full secret.
  if (created) {
    return (
      <div className={PANE_SHELL}>
        <PaneToolbar
          label="New webhook actions"
          primary={
            <Button color="module" size="sm" className="ml-auto" onClick={goManage}>
              Done — manage this webhook
            </Button>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                {created.name} is set up
              </Heading>
              <Text>
                Copy its signing secret now — this is the only time we can show it to you.
              </Text>
            </div>

            <Alert color="success" variant="soft">
              <AlertContent>
                <AlertTitle>Webhook created</AlertTitle>
                <AlertDescription>
                  Notifications will start being sent to the address you gave.
                </AlertDescription>
              </AlertContent>
            </Alert>

            <FormSection
              title="Signing secret"
              description="Whoever receives your notifications uses this to check that a message genuinely came from you and was not tampered with."
            >
              <SecretBox value={created.secret} onCopy={copySecret} />
              <Text className="text-warning text-sm">
                For your security we will not show this again. Copy it now and keep it somewhere
                safe. If it is lost, delete this webhook and set up a new one to get a fresh secret.
              </Text>
            </FormSection>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New webhook actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!canCreate}
            loading={create.isPending}
            onClick={submit}
          >
            Create webhook
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Set up a webhook
            </Heading>
            <Text>
              Tell another system the moment something happens on your site. Give it an address,
              tick the events to listen for, and we will send a message there each time one occurs.
            </Text>
          </div>

          <SaveFailure title="Could not create this webhook" message={failure} />

          <WebhookFields draft={draft} onChange={change} />
        </div>
      </div>
    </div>
  );
}

/* ── Edit / manage ──────────────────────────────────────────────────────── */

function EditWebhook({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { webhook, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useWebhook(id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const initialRef = useRef<string>('');
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!webhook) return;
    if (initializedFor.current === webhook.id) return;
    initializedFor.current = webhook.id;
    const next: Draft = {
      name: webhook.name,
      url: webhook.url,
      events: new Set(webhook.events),
      active: webhook.active,
    };
    setDraft(next);
    initialRef.current = serializeDraft(next);
  }, [webhook]);

  const dirty = draft !== null && serializeDraft(draft) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes to this webhook. Close anyway?');

  const trimmedName = draft?.name.trim() ?? '';
  const displayName = trimmedName !== '' ? trimmedName : (webhook?.name ?? 'Webhook');
  useEffect(() => {
    ctx.setTitle(displayName);
  }, [ctx, displayName]);

  // No missing-state to pass: `useWebhook` resolves out of the LIST, so a deleted webhook arrives as
  // null after a good load and is handled below, never as a 404.
  if (isError) {
    return (
      <PaneLoadError
        title="Could not load this webhook"
        description="This is a problem reaching the server. The webhook itself is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  // Loaded, but no such webhook — deleted elsewhere, or a stale saved layout.
  if (!isLoading && !webhook) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert color="warning" className="max-w-md">
          <AlertContent>
            <AlertTitle>This webhook no longer exists</AlertTitle>
            <AlertDescription>
              It looks like it was deleted. You can close this and set up a new one if you need it.
            </AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="neutral"
            variant="outline"
            onClick={() => {
              ctx.close();
            }}
          >
            Close
          </Button>
        </Alert>
      </div>
    );
  }

  if (isLoading || !webhook || !draft) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return (
    <ManageBody
      ctx={ctx}
      id={id}
      webhook={webhook}
      draft={draft}
      setDraft={setDraft}
      dirty={dirty}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
      onSaved={(saved) => {
        const next: Draft = {
          name: saved.name,
          url: saved.url,
          events: new Set(saved.events),
          active: saved.active,
        };
        setDraft(next);
        initialRef.current = serializeDraft(next);
      }}
    />
  );
}

interface ManageBodyProps {
  ctx: SurfaceContext;
  id: string;
  webhook: WebhookSubscription;
  draft: Draft;
  setDraft: (updater: (current: Draft | null) => Draft | null) => void;
  dirty: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
  onSaved: (saved: WebhookSubscription) => void;
}

function ManageBody({
  ctx,
  id,
  webhook,
  draft,
  setDraft,
  dirty,
  isFetching,
  dataUpdatedAt,
  refetch,
  onSaved,
}: ManageBodyProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateWebhook(id);
  const del = useDeleteWebhook(id);

  const state = webhookState(webhook.active);

  const canSave =
    draft.name.trim() !== '' && draft.url.trim() !== '' && draft.events.size > 0 && dirty;

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const save = () => {
    update.mutate(
      {
        name: draft.name.trim(),
        url: draft.url.trim(),
        events: [...draft.events] as WebhookEventKey[],
        active: draft.active,
      },
      {
        onSuccess: (saved) => {
          onSaved(saved);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: webhookErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${webhook.name}”?`,
      description:
        'This removes the webhook for good and its signing secret with it. Notifications will stop being sent to its address immediately. This cannot be undone — to only stop notifications for now, turn Send notifications off instead.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${webhook.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this webhook',
          description: webhookErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Webhook actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!canSave}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
          </>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>
                {state.detail} Added {formatDateTime(webhook.createdAt)}.
              </AlertDescription>
            </AlertContent>
          </Alert>

          <WebhookFields draft={draft} onChange={change} />

          <FormSection
            title="Signing secret"
            description="Whoever receives your notifications uses this to check that a message genuinely came from you."
          >
            <SecretBox value={webhook.signingSecret} />
            <Text className="text-sm">
              For security the full secret is only shown once, at the moment a webhook is created —
              this is a preview of it. If it has been lost, delete this webhook and set up a new one
              to get a fresh secret.
            </Text>
          </FormSection>

          {/* Destructive action as a plain row under a divider, not a card with
              equal weight to the settings above it. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this webhook</Text>
              <Text className="text-sm">
                Stops notifications for good. To only pause it, turn Send notifications off above.
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              loading={del.isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
