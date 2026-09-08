'use client';

// The automation editor — build a new rule or change an existing one. Create and
// edit are the SAME surface in two states (`{id:'new'}` → `{id}`), because a rule
// is a durable, addressable thing you come back to, not a fire-and-forget dialog.
//
// The body is a TWO-PANE working surface, sibling to the site builder: on the
// LEFT a flow canvas draws the rule as a vertical pipeline of nodes (Settings,
// When, Only-if, then each Then-step); on the RIGHT an inspector edits whichever
// node is selected. Only one node's editor is open at a time — the canvas is the
// readable map, the inspector is where you change one thing. On a narrow pane the
// two stack and a Flow/Properties switch flips between them.
//
// Editing follows the builder's draft → publish model: "Save" stages the change
// into an unpublished draft (the live version keeps running), "Publish" promotes
// it. Turning a rule on/off and which business it runs for take effect
// immediately — they are deployment settings, not part of the versioned document.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  useToast,
} from '@wizeworks/silicaui-react';
import { arrayMove } from '@dnd-kit/sortable';
import { History, ListChecks, Power, Trash2, Undo2, Upload } from 'lucide-react';
import type { Action, ConditionGroup, Trigger } from '@wizeworks/automation-schemas';
import { useActiveSiteId, useModuleStates, useSites } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { FlowCanvas } from './flow-canvas';
import { Inspector } from './inspector';
import { HistoryPanel } from './history-panel';
import {
  automationState,
  parseActions,
  parseConditions,
  parseTrigger,
  SETTINGS_NODE,
  TRIGGER_NODE,
  type NodeId,
} from './automations-presentation';
import { actionDef, availableActions } from './automations-catalog';
import {
  actionAt,
  insertIntoBranch,
  nestedNodeId,
  parseNestedId,
  setActionAt,
  setBranchCondition,
  type BranchArm,
} from './branch-tree';
import {
  automationErrorMessage,
  useCreateAutomation,
  useDeleteAutomation,
  useDiscardDraft,
  usePublishAutomation,
  useSetAutomationStatus,
  useUpdateAutomation,
  type Automation,
} from './automations-data';

const FALLBACK_MODULES = ['crm', 'email', 'commerce', 'b2b', 'cms', 'invoicing'];

// Stable per-action ids — dnd-kit + React key off the ITEM, not the index, so a
// card's identity follows it across inserts and reorders. A random base keeps
// them globally unique even across editor instances / HMR (the builder's rule).
const ID_BASE = Math.random().toString(36).slice(2, 8);
let ACTION_UID = 0;
const newActionId = () => `act-${ID_BASE}-${String(ACTION_UID++)}`;

interface DocFields {
  name: string;
  description: string;
  trigger: Trigger;
  conditions: ConditionGroup;
  actions: Action[];
  /** What this rule is trying to cause (docs/144 §9). Null = no goal, which is
   *  most rules — a receipt email is not trying to cause anything. */
  goal: ConditionGroup | null;
  maxDepth: number;
}

const EMPTY_FIELDS: DocFields = {
  name: '',
  description: '',
  trigger: { kind: 'event', eventType: 'order.placed' },
  conditions: { logic: 'AND', conditions: [] },
  actions: [],
  goal: null,
  maxDepth: 3,
};

/** Read the editing document out of an automation — from its staged draft when one
 *  exists (source 'draft'), or from the live published columns (source 'live'). */
function docFieldsFrom(a: Automation, source: 'draft' | 'live'): DocFields {
  const src =
    source === 'draft' && a.draft
      ? a.draft
      : {
          name: a.name,
          description: a.description,
          triggerType: a.triggerType,
          triggerConfig: a.triggerConfig,
          conditions: a.conditions,
          actions: a.actions,
          goal: a.goal,
          maxDepth: a.maxDepth,
        };
  return {
    name: src.name,
    description: src.description ?? '',
    trigger: parseTrigger(src.triggerType, src.triggerConfig) ?? {
      kind: 'event',
      eventType: src.triggerType,
    },
    conditions: parseConditions(src.conditions),
    actions: parseActions(src.actions),
    // An EMPTY group is not a goal — it passes for everything, so storing one
    // would convert every run the moment it enrolled. A draft written before
    // goals existed has no key at all, which lands here as null either way.
    goal: parseGoal(src.goal),
    maxDepth: src.maxDepth,
  };
}

/** A stored goal, or null when there isn't a meaningful one. */
function parseGoal(stored: unknown): ConditionGroup | null {
  if (stored === null || stored === undefined) return null;
  const parsed = parseConditions(stored);
  return parsed.conditions.length === 0 ? null : parsed;
}

/** Canonical serialization of the authoring document — drives dirty detection.
 *  Site scope is deliberately excluded: it is a live setting, not part of the
 *  versioned draft. */
function serializeDoc(f: DocFields): string {
  return JSON.stringify({
    name: f.name.trim(),
    description: f.description.trim() ? f.description.trim() : null,
    trigger: f.trigger,
    conditions: f.conditions,
    actions: f.actions,
    goal: f.goal,
    maxDepth: f.maxDepth,
  });
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

interface Validation {
  message: string;
  focus: NodeId;
}

export function AutomationEditor({
  ctx,
  automation,
}: {
  ctx: SurfaceContext;
  /** Undefined = creating a new rule; present = editing that rule. */
  automation?: Automation;
}) {
  const isNew = !automation;
  const toast = useToast();
  const confirm = useConfirm();

  const { data: sites } = useSites();
  const { data: active } = useActiveSiteId();
  const { data: moduleStates } = useModuleStates();
  const enabledModules = useMemo(
    () =>
      moduleStates ? moduleStates.filter((m) => m.enabled).map((m) => m.slug) : FALLBACK_MODULES,
    [moduleStates]
  );
  const defaultSite = active?.propertyId ?? sites?.find((s) => s.isPrimary)?.id ?? null;

  const create = useCreateAutomation();
  const update = useUpdateAutomation(automation?.id ?? 'new');
  const scope = useUpdateAutomation(automation?.id ?? 'new');
  const publish = usePublishAutomation(automation?.id ?? 'new');
  const discard = useDiscardDraft(automation?.id ?? 'new');
  const setStatusMut = useSetAutomationStatus(automation?.id ?? 'new');
  const remove = useDeleteAutomation(automation?.id ?? 'new');

  // ── Document state (seeded once from the automation; owned locally after) ──
  const initial = useMemo(
    () =>
      automation ? docFieldsFrom(automation, automation.draft ? 'draft' : 'live') : EMPTY_FIELDS,
    // Seed ONCE — the editor owns the doc after mount (updated from mutation
    // results), so a background refetch of the same row never churns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [trigger, setTrigger] = useState<Trigger>(initial.trigger);
  const [conditions, setConditions] = useState<ConditionGroup>(initial.conditions);
  const [actions, setActions] = useState<Action[]>(initial.actions);
  const [actionIds, setActionIds] = useState<string[]>(() =>
    initial.actions.map(() => newActionId())
  );
  const [goal, setGoal] = useState<ConditionGroup | null>(initial.goal);
  const [maxDepth, setMaxDepth] = useState(initial.maxDepth);

  const [status, setStatus] = useState(automation?.status ?? 'draft');
  const [version, setVersion] = useState(automation?.version ?? 1);
  const [serverHasDraft, setServerHasDraft] = useState(Boolean(automation?.draft));
  const [baseline, setBaseline] = useState(() => serializeDoc(initial));

  const [siteScope, setSiteScope] = useState<string | null>(
    automation ? automation.propertyId : null
  );
  const scopeSet = useRef(false);
  useEffect(() => {
    // Create defaults the scope to the site being worked in, once it resolves,
    // unless the operator has already chosen one.
    if (isNew && !scopeSet.current && defaultSite) {
      scopeSet.current = true;
      setSiteScope(defaultSite);
    }
  }, [isNew, defaultSite]);

  const [selectedId, setSelectedId] = useState<NodeId>(SETTINGS_NODE);
  const [mobilePane, setMobilePane] = useState<'flow' | 'edit'>('flow');
  const [showHistory, setShowHistory] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDoc = useMemo(
    () => serializeDoc({ name, description, trigger, conditions, actions, goal, maxDepth }),
    [name, description, trigger, conditions, actions, goal, maxDepth]
  );
  const dirty = currentDoc !== baseline;
  const hasUnpublished = dirty || serverHasDraft;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This automation has not been created yet. Close anyway?'
      : 'This automation has unsaved changes. Close anyway?'
  );

  useEffect(() => {
    ctx.setTitle(name.trim() || (isNew ? 'New automation' : 'Automation'));
  }, [ctx, name, isNew]);

  const busy =
    create.isPending ||
    update.isPending ||
    publish.isPending ||
    discard.isPending ||
    setStatusMut.isPending ||
    remove.isPending;

  // ── Selection ──
  const selectNode = (id: NodeId) => {
    setSelectedId(id);
    setShowHistory(false);
    setMobilePane('edit');
  };

  // ── Action list operations (the canvas drives these callbacks) ──
  function insertAction(atIndex: number) {
    const first = availableActions(enabledModules)[0];
    const action: Action = {
      type: first?.type ?? 'platform.stop',
      config: first?.jsonTemplate ?? {},
    };
    const id = newActionId();
    const clamped = Math.min(Math.max(atIndex, 0), actions.length);
    setActions((prev) => {
      const next = [...prev];
      next.splice(clamped, 0, action);
      return next;
    });
    setActionIds((prev) => {
      const next = [...prev];
      next.splice(clamped, 0, id);
      return next;
    });
    selectNode(id);
  }

  function moveAction(from: number, to: number) {
    setActions((prev) => arrayMove(prev, from, to));
    setActionIds((prev) => arrayMove(prev, from, to));
  }

  // ── editing a step, wherever it sits ──
  //
  // A node id is either a top-level action id (`act-…`) or a PATH into a branch
  // (`act-…::then.0`). Both arrive through the same two functions, so the
  // inspector never has to know whether the step it is editing is nested — which
  // is what stops branch support leaking into every editor form.

  function updateAction(id: string, next: Action) {
    const nested = parseNestedId(id);
    if (nested) {
      const rootIndex = actionIds.indexOf(nested.rootId);
      if (rootIndex < 0) return;
      setActions((prev) =>
        prev.map((a, idx) => (idx === rootIndex ? setActionAt(a, nested.path, next) : a))
      );
      return;
    }
    const i = actionIds.indexOf(id);
    if (i < 0) return;
    setActions((prev) => prev.map((a, idx) => (idx === i ? next : a)));
  }

  function removeAction(id: string) {
    const nested = parseNestedId(id);
    if (nested) {
      const rootIndex = actionIds.indexOf(nested.rootId);
      if (rootIndex < 0) return;
      setActions((prev) =>
        prev.map((a, idx) => (idx === rootIndex ? setActionAt(a, nested.path, null) : a))
      );
      // Select the branch that held it. Selecting a sibling would need the path
      // arithmetic for "the step before this one in this arm", and a deleted
      // step's neighbour is not obviously what somebody wants to look at next.
      if (selectedId === id) setSelectedId(nested.rootId);
      return;
    }
    const i = actionIds.indexOf(id);
    if (i < 0) return;
    setActions((prev) => prev.filter((_, idx) => idx !== i));
    setActionIds((prev) => prev.filter((_, idx) => idx !== i));
    if (selectedId === id) setSelectedId(actionIds[i - 1] ?? actionIds[i + 1] ?? TRIGGER_NODE);
  }

  /** Add a step inside one arm of a branch. `branchNodeId` is the branch's own
   *  node id — top-level or itself nested. */
  function insertIntoArm(branchNodeId: string, arm: BranchArm, atIndex: number) {
    const first = availableActions(enabledModules)[0];
    const action: Action = {
      type: first?.type ?? 'platform.stop',
      config: first?.jsonTemplate ?? {},
    };

    const nested = parseNestedId(branchNodeId);
    const rootId = nested?.rootId ?? branchNodeId;
    const branchPath = nested?.path ?? [];
    const rootIndex = actionIds.indexOf(rootId);
    if (rootIndex < 0) return;

    setActions((prev) =>
      prev.map((a, idx) =>
        idx === rootIndex ? insertIntoBranch(a, branchPath, arm, atIndex, action) : a
      )
    );
    selectNode(nestedNodeId(rootId, [...branchPath, { arm, index: atIndex }]));
  }

  /** Change the question a branch asks (and the note shown on its card). */
  function setBranchQuestion(branchNodeId: string, condition: ConditionGroup, label?: string) {
    const nested = parseNestedId(branchNodeId);
    const rootId = nested?.rootId ?? branchNodeId;
    const branchPath = nested?.path ?? [];
    const rootIndex = actionIds.indexOf(rootId);
    if (rootIndex < 0) return;
    setActions((prev) =>
      prev.map((a, idx) =>
        idx === rootIndex ? setBranchCondition(a, branchPath, condition, label) : a
      )
    );
  }

  /** The action a node id points at, top-level or nested. */
  function actionForNode(id: string): Action | null {
    const nested = parseNestedId(id);
    if (!nested) {
      const i = actionIds.indexOf(id);
      return i >= 0 ? (actions[i] ?? null) : null;
    }
    const rootIndex = actionIds.indexOf(nested.rootId);
    if (rootIndex < 0) return null;
    const root = actions[rootIndex];
    return root ? actionAt(root, nested.path) : null;
  }

  // Replace the whole document (after discard → live, or restore → draft).
  function loadFields(f: DocFields) {
    setName(f.name);
    setDescription(f.description);
    setTrigger(f.trigger);
    setConditions(f.conditions);
    setActions(f.actions);
    setActionIds(f.actions.map(() => newActionId()));
    setGoal(f.goal);
    setMaxDepth(f.maxDepth);
    setSelectedId(SETTINGS_NODE);
    setBaseline(serializeDoc(f));
    setError(null);
  }

  // ── Validation ──
  function validate(): Validation | null {
    if (!name.trim()) return { message: 'Give this automation a name.', focus: SETTINGS_NODE };
    if (trigger.kind === 'event' && !trigger.eventType.trim()) {
      return { message: 'Choose what starts this automation.', focus: TRIGGER_NODE };
    }
    if (
      trigger.kind === 'schedule' &&
      trigger.schedule.cadence === 'once' &&
      !trigger.schedule.at
    ) {
      return { message: 'Set the date and time this should run.', focus: TRIGGER_NODE };
    }
    if (actions.length === 0) {
      return { message: 'Add at least one step for this rule to do.', focus: TRIGGER_NODE };
    }
    for (const [i, a] of actions.entries()) {
      const def = actionDef(a.type);
      if (def?.mode === 'fields' && def.configFields) {
        const config = a.config;
        for (const f of def.configFields) {
          if (!f.required) continue;
          const v = config[f.key];
          const missing = v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
          if (missing) {
            return {
              message: `Step ${String(i + 1)} (${def.label}) needs “${f.label}”.`,
              focus: actionIds[i] ?? TRIGGER_NODE,
            };
          }
        }
      }
    }
    return null;
  }

  function checkValid(): boolean {
    setSubmitted(true);
    const v = validate();
    if (v) {
      setError(v.message);
      selectNode(v.focus);
      return false;
    }
    setError(null);
    return true;
  }

  function docPayload() {
    return {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      trigger,
      conditions,
      actions,
      goal,
      maxDepth,
    };
  }

  // ── Save / publish / lifecycle ──
  const onCreate = () => {
    if (!checkValid()) return;
    create.mutate(
      { ...docPayload(), propertyId: siteScope },
      {
        onSuccess: (created) => {
          ctx.open('automations.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${created.name} created`,
              description: 'It is saved as a draft. Turn it on when you are ready.',
              type: 'success',
            });
          });
        },
        onError: (e) => {
          setError(
            automationErrorMessage(e, 'Could not create this automation. Nothing was changed.')
          );
        },
      }
    );
  };

  const onSave = () => {
    if (!automation || !checkValid()) return;
    const snapshot = currentDoc;
    update.mutate(docPayload(), {
      onSuccess: () => {
        setBaseline(snapshot);
        setServerHasDraft(true);
        toast.add({
          title: 'Saved as a draft',
          description: 'Publish it to make your changes live.',
          type: 'success',
        });
      },
      onError: (e) => {
        setError(automationErrorMessage(e, 'Could not save this automation. Nothing was changed.'));
      },
    });
  };

  const onPublish = async () => {
    if (!automation || !checkValid()) return;
    const snapshot = currentDoc;
    try {
      if (dirty) await update.mutateAsync(docPayload());
      const result = await publish.mutateAsync(undefined);
      setBaseline(snapshot);
      setServerHasDraft(false);
      setVersion(result.version);
      toast.add({
        title: `Published version ${String(result.version)}`,
        description: 'Your changes are now live.',
        type: 'success',
      });
    } catch (e) {
      setError(automationErrorMessage(e, 'Could not publish. Nothing was changed.'));
    }
  };

  const onDiscard = async () => {
    if (!automation) return;
    const ok = await confirm({
      title: 'Discard your unpublished changes?',
      description:
        'This throws away the draft and keeps the live version exactly as it is running now. This cannot be undone.',
      confirmLabel: 'Discard the draft',
      cancelLabel: 'Keep editing',
      color: 'danger',
    });
    if (!ok) return;
    discard.mutate(undefined, {
      onSuccess: (live) => {
        loadFields(docFieldsFrom(live, 'live'));
        setServerHasDraft(false);
        toast.add({ title: 'Draft discarded', type: 'success' });
      },
      onError: (e) => {
        toast.add({
          title: 'Could not discard the draft',
          description: automationErrorMessage(e, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onToggleStatus = () => {
    if (!automation) return;
    const next = status === 'active' ? 'paused' : 'active';
    setStatusMut.mutate(next, {
      onSuccess: () => {
        setStatus(next);
        toast.add({
          title: next === 'active' ? `${name} is on` : `${name} paused`,
          description:
            next === 'active'
              ? 'It will act every time its trigger happens.'
              : 'It keeps its setup and can be turned back on.',
          type: 'success',
        });
      },
      onError: (e) => {
        toast.add({
          title: 'Could not change whether it is on',
          description: automationErrorMessage(e, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onSiteScope = (next: string | null) => {
    scopeSet.current = true;
    setSiteScope(next);
    if (!automation) return; // create → applied at create time
    scope.mutate(
      { propertyId: next },
      {
        onError: (e) => {
          toast.add({
            title: 'Could not change which business this runs for',
            description: automationErrorMessage(e, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    if (!automation) return;
    const ok = await confirm({
      title: `Delete ${name}?`,
      description:
        'This permanently removes the automation and its version history. Its past run records are kept. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${name} deleted`, type: 'success' });
        });
      },
      onError: (e) => {
        toast.add({
          title: 'Could not delete this automation',
          description: automationErrorMessage(e, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onRestored = (restored: Automation) => {
    loadFields(docFieldsFrom(restored, 'draft'));
    setServerHasDraft(true);
    setShowHistory(false);
  };

  const state = automationState(status);
  const showDiscard = !isNew && serverHasDraft && !dirty;
  // The flow map is the gray canvas the step cards sit ON (base-200); the
  // inspector to its right is the raised working surface (base-100). Matches the
  // dashboard's two-tone map + inspector split.
  const flowPane = 'bg-base-200 min-h-0 overflow-y-auto';
  const paneCard = 'card bg-base-100 min-h-0 overflow-y-auto';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Automation actions"
        controls={
          <>
            {!isNew ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : null}
            {hasUnpublished && !isNew ? (
              <Badge color="info" variant="soft" size="sm">
                Unpublished changes
              </Badge>
            ) : null}
            {automation ? (
              <>
                <Button
                  size="sm"
                  variant={showHistory ? 'soft' : 'ghost'}
                  color={showHistory ? 'module' : 'neutral'}
                  className="ml-auto shrink-0"
                  onClick={() => {
                    setShowHistory((v) => !v);
                    setMobilePane('edit');
                  }}
                >
                  <History className="size-4" aria-hidden />
                  History
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color={status === 'active' ? 'neutral' : 'module'}
                  className="shrink-0"
                  loading={setStatusMut.isPending}
                  onClick={onToggleStatus}
                >
                  <Power className="size-4" aria-hidden />
                  {status === 'active' ? 'Pause' : 'Turn on'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  className="shrink-0"
                  title="See when this rule has run"
                  onClick={(event) => {
                    ctx.open(
                      'automations.runs',
                      { automationId: automation.id },
                      { target: targetFor(event) }
                    );
                  }}
                >
                  <ListChecks className="size-4" aria-hidden />
                  Runs
                </Button>
                {showDiscard ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    className="shrink-0"
                    loading={discard.isPending}
                    onClick={() => {
                      void onDiscard();
                    }}
                  >
                    <Undo2 className="size-4" aria-hidden />
                    Discard draft
                  </Button>
                ) : null}
                {hasUnpublished ? (
                  <Button
                    size="sm"
                    variant="outline"
                    color="module"
                    className="shrink-0"
                    loading={publish.isPending || (update.isPending && dirty)}
                    onClick={() => {
                      void onPublish();
                    }}
                  >
                    <Upload className="size-4" aria-hidden />
                    Publish
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  color="module"
                  className="shrink-0"
                  loading={update.isPending && !publish.isPending}
                  disabled={!dirty || busy}
                  onClick={onSave}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  className="shrink-0"
                  aria-label="Delete this automation"
                  title="Delete this automation"
                  loading={remove.isPending}
                  onClick={() => {
                    void onDelete();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                color="module"
                className="ml-auto shrink-0"
                loading={create.isPending}
                disabled={busy}
                onClick={onCreate}
              >
                Create
              </Button>
            )}
          </>
        }
      />

      {error ? (
        <Alert color="error" className="shrink-0">
          <AlertContent>
            <AlertTitle>{isNew ? 'Cannot create this yet' : 'Cannot save this yet'}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {/* Narrow-pane switch — hidden once the two panes fit side by side. */}
      <div className="flex shrink-0 gap-1 @3xl:hidden">
        {(['flow', 'edit'] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={mobilePane === p ? 'soft' : 'ghost'}
            color={mobilePane === p ? 'module' : 'neutral'}
            onClick={() => {
              setMobilePane(p);
            }}
          >
            {p === 'flow' ? 'Flow' : showHistory ? 'History' : 'Properties'}
          </Button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 @3xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className={`${mobilePane === 'flow' ? 'block' : 'hidden'} @3xl:block ${flowPane}`}>
          <FlowCanvas
            name={name}
            status={status}
            maxDepth={maxDepth}
            trigger={trigger}
            conditions={conditions}
            actions={actions}
            goal={goal}
            actionIds={actionIds}
            selectedId={selectedId}
            onSelect={selectNode}
            onInsertAction={insertAction}
            onMoveAction={moveAction}
            onInsertIntoArm={insertIntoArm}
          />
        </div>

        <aside className={`${mobilePane === 'edit' ? 'block' : 'hidden'} @3xl:block ${paneCard}`}>
          {showHistory && automation ? (
            <div className="p-3 @lg:p-4">
              <HistoryPanel
                id={automation.id}
                liveVersion={version}
                dirty={dirty}
                onRestored={onRestored}
              />
            </div>
          ) : (
            <Inspector
              selectedId={selectedId}
              enabledModules={enabledModules}
              isNew={isNew}
              name={name}
              onName={setName}
              nameError={name.trim() === '' ? 'Give this automation a name.' : null}
              touched={submitted}
              description={description}
              onDescription={setDescription}
              maxDepth={maxDepth}
              onMaxDepth={setMaxDepth}
              siteScope={siteScope}
              onSiteScope={onSiteScope}
              sites={sites ?? []}
              trigger={trigger}
              onTrigger={setTrigger}
              conditions={conditions}
              onConditions={setConditions}
              actions={actions}
              actionIds={actionIds}
              onAction={updateAction}
              onRemoveAction={removeAction}
              goal={goal}
              onGoal={setGoal}
              actionForNode={actionForNode}
              onBranchQuestion={setBranchQuestion}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
