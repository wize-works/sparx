'use client';

// Setting one up, and the one moment the full signing secret exists.
//
// Creating does NOT swap straight to the manage view: a `replace` would refetch
// the record with the secret already redacted and the real value gone for good.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { SaveFailure } from '../../components/save-failure';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { checkAddress } from './webhook-address';
import { WebhookFields } from './webhook-fields';
import { WebhookSecret } from './webhook-secret';
import { COLUMN } from './webhook-column';
import { draftProblem, emptyDraft, type WebhookDraft } from './webhook-draft';
import { useCreateWebhook, webhookErrorMessage, type WebhookEventKey } from './webhooks-data';

interface Created {
  id: string;
  name: string;
  secret: string;
}

export function CreateWebhook({ ctx }: { ctx: SurfaceContext }) {
  const create = useCreateWebhook();
  const [draft, setDraft] = useState<WebhookDraft>(emptyDraft);
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    ctx.setTitle('New notification');
  }, [ctx]);

  const dirty =
    created === null &&
    (draft.name.trim() !== '' || draft.url.trim() !== '' || draft.events.size > 0);
  useDirtySource(dirty, 'You have started setting this up and have not saved it. Close anyway?');

  const problem = draftProblem(draft);
  const failure = create.isError
    ? webhookErrorMessage(create.error, 'Nothing was saved. Please try again.')
    : null;

  const submit = () => {
    const address = checkAddress(draft.url);
    if (problem !== null || !address.ok) return;
    create.mutate(
      {
        name: draft.name.trim(),
        url: address.url,
        events: [...draft.events] as WebhookEventKey[],
        active: draft.active,
      },
      {
        onSuccess: (row) => {
          setCreated({ id: row.id, name: row.name, secret: row.signingSecret });
        },
        onError: shownInPlace,
      }
    );
  };

  if (created) {
    return <SecretReveal ctx={ctx} created={created} />;
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Set-up actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={problem !== null}
            title={problem ?? undefined}
            loading={create.isPending}
            onClick={submit}
          >
            Set it up
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            Tell another system the moment something happens on your site. Give it an address, tick
            the events to listen for, and we will send a message there each time one occurs.
          </Text>

          <SaveFailure title="Could not set that up" message={failure} />

          <WebhookFields
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
        </div>
      </div>
    </div>
  );
}

/** The full secret, once. */
function SecretReveal({ ctx, created }: { ctx: SurfaceContext; created: Created }) {
  const toast = useToast();

  const copy = () => {
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

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Set-up actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            onClick={() => {
              ctx.open('cms.webhooks.detail', { id: created.id }, { target: 'replace' });
            }}
          >
            Done — manage this
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>Copy its signing secret now — this is the only time we can show it to you.</Text>

          <Alert color="success" variant="soft">
            <AlertContent>
              <AlertTitle>{created.name} is set up</AlertTitle>
              <AlertDescription>
                Nothing has been sent yet. The first message goes out the next time one of the
                events you picked happens, and you will be able to see it here.
              </AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection
            title="Signing secret"
            description="Whoever receives your notifications uses this to check that a message genuinely came from you and was not tampered with."
          >
            <WebhookSecret value={created.secret} onCopy={copy} />
            <Text className="text-warning text-sm">
              For your security we will not show this again. Copy it now and keep it somewhere safe.
              If it is lost, delete this and set up a new one to get a fresh secret.
            </Text>
          </FormSection>
        </div>
      </div>
    </div>
  );
}
