'use client';

// One workflow — its name, and the stages a document travels through.
//
// The body is a TWO-PANE working surface, the sibling of the automations editor:
// on the LEFT a stage canvas draws the workflow as a vertical pipeline of nodes (a
// Settings node, then each stage in order); on the RIGHT an inspector edits
// whichever node is selected. Only one node's editor is open at a time — the
// canvas is the readable map of the customer's journey, the inspector is where you
// change one thing. On a narrow pane the two stack and a Flow/Properties switch
// flips between them. This is a workflow, so it should FEEL like one.
//
// Create and edit are the same surface (`{id:'new'}` → `{id}`), per the app's pane
// rule: a workflow is a durable thing you come back to, and building one is minutes
// of work with real content to lose, so it could never have been a modal. Saving a
// new one retargets this pane at the saved workflow rather than opening a second
// tab, so the operator keeps working in the pane they were already in.
//
// Explicit save, last-write-wins, one button — the platform rule for every editor.
// Invoicing workflows are NOT versioned: there is no draft/publish here, unlike
// automations. The parity with automations is the two-pane canvas+inspector feel,
// not the versioning toolbar. The whole workflow including its stage list is one
// draft, and ./workflow-save.ts turns that draft into the four separate writes the
// API actually needs — reordering the stages and renaming two of them is ONE thing
// the operator did.

import { useEffect, useState } from 'react';
import { useMutation } from '@wizeworks/query';
import { arrayMove } from '@dnd-kit/sortable';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useToast,
} from '@wizeworks/silicaui-react';
import { Archive, MoreHorizontal, Save } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { StageCanvas, SETTINGS_NODE } from './stage-canvas';
import { StageInspector } from './stage-inspector';
import type { DocumentWorkflowDetail } from './types';
import {
  blankStage,
  emptyWorkflowDraft,
  slugify,
  toWorkflowDraft,
  useArchiveWorkflow,
  useInvalidateWorkflows,
  useWorkflow,
  workflowErrorMessage,
  type StageDraft,
  type WorkflowDraft,
} from './workflow-data';
import { saveWorkflow, WorkflowValidationError } from './workflow-save';

export function WorkflowEditorSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const { data: workflow, isPending, isError } = useWorkflow(id);
  const invalidate = useInvalidateWorkflows();
  const archive = useArchiveWorkflow();
  const toast = useToast();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<WorkflowDraft>(emptyWorkflowDraft);
  const [dirty, setDirty] = useState(false);
  // Once the operator has typed a reference name of their own, the name field
  // stops overwriting it — otherwise fixing a typo in the title silently rewrites
  // a slug that may already be linked to from elsewhere.
  const [slugTouched, setSlugTouched] = useState(false);
  /**
   * The workflow as the server last confirmed it — the baseline the save diff
   * reconciles against.
   *
   * Held in state rather than read straight off the query, and that is
   * load-bearing. A save CREATES stages, which means the ids in `draft` and the
   * stage list in the baseline are both stale the instant it returns. Waiting for
   * the invalidated query to come back and fix them leaves a window where a second
   * save still sees `id: null` on stages that now exist — and creates every one of
   * them a second time. `saveWorkflow` returns the reconciled workflow precisely
   * so both can be corrected synchronously here.
   */
  const [original, setOriginal] = useState<DocumentWorkflowDetail | null>(null);

  // Which node the inspector is editing: the Settings node, or a stage by its key.
  const [selectedId, setSelectedId] = useState<string>(SETTINGS_NODE);
  const [mobilePane, setMobilePane] = useState<'flow' | 'edit'>('flow');

  useDirtySource(dirty, 'This workflow has unsaved changes. Close it anyway?');

  /** Adopt a server state as both the draft and the baseline. */
  const adopt = (next: DocumentWorkflowDetail) => {
    setDraft(toWorkflowDraft(next));
    setOriginal(next);
    setSlugTouched(true);
    ctx.setTitle(next.name);
  };

  // Guarded on `dirty` so a background refetch can never overwrite what someone is
  // part-way through typing.
  useEffect(() => {
    if (!workflow || dirty) return;
    adopt(workflow);
    // ctx is stable per pane, and adopt is recreated each render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow]);

  useEffect(() => {
    ctx.setTitle(draft.name.trim() || (isNew ? 'New workflow' : 'Workflow'));
  }, [ctx, draft.name, isNew]);

  const update = (patch: Partial<WorkflowDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  // ── Selection ──
  const selectNode = (nodeId: string) => {
    setSelectedId(nodeId);
    setMobilePane('edit');
  };

  // ── Stage list operations (the canvas drives these callbacks) ──
  const setStages = (next: StageDraft[]) => {
    update({ stages: next });
  };

  function insertStage(atIndex: number) {
    const stage = blankStage();
    const clamped = Math.min(Math.max(atIndex, 0), draft.stages.length);
    const next = [...draft.stages];
    next.splice(clamped, 0, stage);
    setStages(next);
    selectNode(stage.key);
  }

  function moveStage(from: number, to: number) {
    setStages(arrayMove(draft.stages, from, to));
  }

  function patchStage(key: string, changes: Partial<StageDraft>) {
    setStages(draft.stages.map((stage) => (stage.key === key ? { ...stage, ...changes } : stage)));
  }

  function removeStage(key: string) {
    const index = draft.stages.findIndex((stage) => stage.key === key);
    if (index < 0) return;
    setStages(draft.stages.filter((stage) => stage.key !== key));
    if (selectedId === key) {
      const neighbour = draft.stages[index + 1] ?? draft.stages[index - 1];
      setSelectedId(neighbour ? neighbour.key : SETTINGS_NODE);
    }
  }

  // ── Settings callbacks ──
  const onName = (value: string) => {
    update(slugTouched ? { name: value } : { name: value, slug: slugify(value) });
  };
  const onSlug = (value: string) => {
    setSlugTouched(true);
    update({ slug: slugify(value) });
  };

  const save = useMutation({
    mutationFn: () => saveWorkflow({ id, draft, original }),
    onSuccess: (saved) => {
      setDirty(false);
      adopt(saved);
      invalidate();
      toast.add({ title: isNew ? 'Workflow created' : 'Workflow saved', type: 'success' });
      if (isNew) ctx.open('invoicing.workflow.edit', { id: saved.id }, { target: 'replace' });
    },
  });

  const onArchive = async () => {
    if (!original) return;
    const ok = await confirm({
      title: `Archive “${original.name}”?`,
      description:
        'It stops being offered when someone creates a document. Documents already using it are untouched and keep working exactly as they do now.',
      color: 'danger',
      confirmLabel: 'Archive workflow',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    archive.mutate(original.id, {
      onSuccess: () => {
        toast.add({ title: 'Workflow archived', type: 'success' });
        setDirty(false);
        ctx.close();
      },
      onError: (error) => {
        toast.add({
          title: 'Could not archive this workflow',
          description: workflowErrorMessage(error, 'Try again in a moment.'),
          type: 'error',
        });
      },
    });
  };

  // A validation problem is the operator's to fix and says so in their words;
  // anything else is ours and shouldn't pretend to be actionable.
  const failure = save.error
    ? save.error instanceof WorkflowValidationError
      ? save.error.message
      : workflowErrorMessage(
          save.error,
          'This workflow could not be saved. It may be a temporary problem — try again in a moment.'
        )
    : null;

  if (isError) {
    return (
      <div className={PANE_SHELL}>
        <Alert color="danger" variant="soft">
          This workflow could not be loaded. It may have been archived, or this is a problem
          reaching the server.
        </Alert>
      </div>
    );
  }

  if (isPending && !isNew) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // The stage map is the gray canvas the cards sit ON (base-200); the inspector to
  // its right is the raised working surface (base-100). Matches the automations
  // two-tone map + inspector split.
  const flowPane = 'bg-base-200 min-h-0 overflow-y-auto';
  const paneCard = 'card bg-base-100 min-h-0 overflow-y-auto';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Workflow editor actions"
        primary={
          <Button
            color="module"
            size="sm"
            className={original ? 'shrink-0' : 'ml-auto shrink-0'}
            disabled={!dirty || save.isPending}
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            <Save className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            {original?.archivedAt ? (
              <Badge color="neutral" variant="soft" size="sm">
                Archived
              </Badge>
            ) : null}
            {draft.isDefault ? (
              <Badge color="module" variant="soft" size="sm">
                Default
              </Badge>
            ) : null}
            {original ? (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    className="ml-auto shrink-0"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => {
                      void onArchive();
                    }}
                  >
                    <Archive className="size-4" aria-hidden />
                    Archive workflow
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      {failure ? (
        <Alert color="danger" variant="soft" className="shrink-0">
          <AlertContent>
            <AlertTitle>{isNew ? 'Cannot create this yet' : 'Cannot save this yet'}</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {/* Narrow-pane switch — hidden once the two panes fit side by side. */}
      <div className="flex shrink-0 gap-1 @3xl:hidden">
        {(['flow', 'edit'] as const).map((pane) => (
          <Button
            key={pane}
            size="sm"
            variant={mobilePane === pane ? 'soft' : 'ghost'}
            color={mobilePane === pane ? 'module' : 'neutral'}
            onClick={() => {
              setMobilePane(pane);
            }}
          >
            {pane === 'flow' ? 'Flow' : 'Properties'}
          </Button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 @3xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className={`${mobilePane === 'flow' ? 'block' : 'hidden'} @3xl:block ${flowPane}`}>
          <StageCanvas
            name={draft.name}
            slug={draft.slug}
            isDefault={draft.isDefault}
            stages={draft.stages}
            selectedId={selectedId}
            onSelect={selectNode}
            onInsertStage={insertStage}
            onMoveStage={moveStage}
          />
        </div>

        <aside className={`${mobilePane === 'edit' ? 'block' : 'hidden'} @3xl:block ${paneCard}`}>
          <StageInspector
            selectedId={selectedId}
            draft={draft}
            onName={onName}
            onSlug={onSlug}
            onDefault={(value) => {
              update({ isDefault: value });
            }}
            onStagePatch={patchStage}
            onStageRemove={removeStage}
          />
        </aside>
      </div>
    </div>
  );
}
