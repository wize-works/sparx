'use client';

// One campaign — set it up, turn it on, and read how it is doing.
//
// A PANE, and creating one is the same pane with `{id:'new'}`. The report sits
// ABOVE the setup because a campaign is configured once and looked at for months.

import { shownInPlace } from '@wizeworks/query';
import { useEffect } from 'react';
import { useToast } from '@wizeworks/silicaui-react';
import { PANE_SHELL } from '../../components/pane-toolbar';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneWaiting } from '../../components/pane-waiting';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useViewer } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { CampaignActions } from './campaign-actions';
import { useCampaignDraft } from './campaign-draft';
import { NewCampaign } from './campaign-new';
import { ReportPanel } from './campaign-report';
import { CampaignSetup } from './campaign-setup';

import { funnelErrorMessage, useDeleteFunnel, useFunnel, useUpdateFunnel } from './data';
import { canEditCampaigns } from './presentation';

export function CampaignSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  if (id === 'new') return <NewCampaign ctx={ctx} />;
  return <ExistingCampaign ctx={ctx} id={id} />;
}

/** The house column. A pane can be 1200px wide and a form still reads at ~700,
 *  so every editor in this console centres itself in the same `max-w-3xl`. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function ExistingCampaign({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const funnel = useFunnel(id);
  const canEdit = canEditCampaigns(useViewer().data?.role);
  const update = useUpdateFunnel(id);
  const remove = useDeleteFunnel();
  const toast = useToast();
  const confirm = useConfirm();
  const draft = useCampaignDraft(funnel.data);

  useDirtySource(canEdit && draft.changed, 'This campaign has unsaved changes. Close anyway?');

  const title = funnel.data?.name;
  useEffect(() => {
    if (title) ctx.setTitle(title);
  }, [title, ctx]);

  if (funnel.isPending) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting module="funnels" />
      </div>
    );
  }

  if (funnel.isError || !funnel.data) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          error={funnel.error}
          noun="campaign"
          module="funnels"
          title="Could not open this campaign"
          description={funnelErrorMessage(
            funnel.error,
            'It may have been deleted, or this is a problem reaching the server.'
          )}
          onRetry={() => {
            void funnel.refetch();
          }}
        />
      </div>
    );
  }

  const current = funnel.data;

  const save = () => {
    update.mutate(
      {
        name: draft.name,
        description: draft.description || null,
        stages: draft.stages,
        goal: draft.hasGoal ? draft.goal : null,
        entryFormNodeId: draft.entryFormNodeId,
        stallAfterHours: draft.stallAfterHours,
      },
      {
        onSuccess: () => toast.add({ title: 'Campaign saved', type: 'success' }),
        onError: shownInPlace,
      }
    );
  };

  const setRunning = (next: boolean) => {
    update.mutate(
      { status: next ? 'active' : 'paused' },
      {
        onSuccess: () =>
          toast.add({
            title: next ? 'Campaign is running' : 'Campaign paused',
            description: next
              ? 'It is counting people from now on.'
              : 'It keeps everything it has already recorded.',
            type: 'success',
          }),
        onError: shownInPlace,
      }
    );
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${current.name}?`,
      description:
        'This removes the campaign and every number recorded against it. The people it recorded stay in your customer list. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(id, {
      onSuccess: () => {
        ctx.close();
        toast.add({ title: `${current.name} deleted`, type: 'success' });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <CampaignActions
        status={current.status}
        canEdit={canEdit}
        busy={update.isPending}
        changed={draft.changed}
        blockedReason={draft.blockedReason}
        onSave={save}
        onToggleRunning={setRunning}
        onDelete={() => {
          void onDelete();
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className={COLUMN}>
          {/* NO report block on a draft, and no empty state standing in for one.
              A draft has never counted anybody, which the toolbar already says
              in four words — and a whole-pane empty state repeating it pushed
              the form somebody opened this pane to fill in two thirds of the way
              down the window. Every campaign starts as a draft, so that was the
              first thing everyone saw. The report appears when there is one. */}
          {current.status === 'draft' ? null : <ReportPanel id={id} />}

          <CampaignSetup
            draft={draft}
            on={draft}
            canEdit={canEdit}
            defaultStallHours={current.defaultStallHours}
            error={
              update.isError
                ? funnelErrorMessage(update.error, 'That change could not be saved.')
                : null
            }
          />
        </div>
      </div>
    </div>
  );
}

export default CampaignSurface;
