'use client';

// The manage view itself, once the record and its draft exist.

import { shownInPlace } from '@wizeworks/query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { SaveFailure } from '../../components/save-failure';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { checkAddress } from './webhook-address';
import { WebhookFields } from './webhook-fields';
import { DeleteRow, SecretPreview } from './webhook-manage-footer';
import { WebhookDeliveries } from './webhook-deliveries';
import { COLUMN } from './webhook-column';
import { draftProblem, type WebhookDraft } from './webhook-draft';
import {
  formatDateTime,
  useDeleteWebhook,
  useUpdateWebhook,
  webhookErrorMessage,
  webhookState,
  type WebhookEventKey,
  type WebhookSubscription,
} from './webhooks-data';

export interface ManageBodyProps {
  ctx: SurfaceContext;
  id: string;
  webhook: WebhookSubscription;
  draft: WebhookDraft;
  dirty: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  onChange: (patch: Partial<WebhookDraft>) => void;
  onRefresh: () => void;
  onSaved: (saved: WebhookSubscription) => void;
}

export function ManageBody(props: ManageBodyProps) {
  const { ctx, id, webhook, draft, dirty, isFetching, dataUpdatedAt } = props;
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateWebhook(id);
  const del = useDeleteWebhook(id);

  // Read off what actually happened, not off the `active` switch.
  const state = webhookState(webhook.active, webhook.health);
  const problem = draftProblem(draft);
  const failure = update.isError
    ? webhookErrorMessage(update.error, 'Nothing was changed. Please try again.')
    : null;

  const save = () => {
    const address = checkAddress(draft.url);
    if (problem !== null || !address.ok) return;
    update.mutate(
      {
        name: draft.name.trim(),
        url: address.url,
        events: [...draft.events] as WebhookEventKey[],
        active: draft.active,
      },
      {
        onSuccess: (saved) => {
          props.onSaved(saved);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: shownInPlace,
      }
    );
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${webhook.name}”?`,
      description:
        'This removes it for good and its signing secret with it. Notifications stop being sent to its address immediately. This cannot be undone — to only stop them for now, turn Send notifications off instead.',
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
          title: 'Could not delete this',
          description: webhookErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Notification actions"
        status={
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={problem !== null || !dirty}
            title={problem ?? undefined}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={props.onRefresh}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>
                {state.detail} Set up {formatDateTime(webhook.createdAt)}.
              </AlertDescription>
            </AlertContent>
          </Alert>

          <SaveFailure title="Could not save that" message={failure} />

          <WebhookFields draft={draft} onChange={props.onChange} />

          <WebhookDeliveries id={id} />

          <SecretPreview value={webhook.signingSecret} />

          <DeleteRow busy={del.isPending} onDelete={remove} />
        </div>
      </div>
    </div>
  );
}
