'use client';

// One campaign — set it up, turn it on, and read how it is doing.
//
// A PANE, not a modal, and creating one is the same pane with `{id:'new'}`. A
// campaign is a durable thing you come back to, its ladder takes minutes to get
// right, and the report you want beside it is the whole reason to open it.
//
// ── WHY THE REPORT IS ABOVE THE SETTINGS ───────────────────────────────────
//
// A campaign is set up once and looked at for months. Putting the form first
// would make the common visit scroll past a form nobody is editing to reach the
// number they came for. A new campaign has no report, so the order inverts
// itself: with nothing to show, the setup IS the top of the pane.
//
// ── WHAT THE ACTIVATION BUTTON HAS TO SAY ──────────────────────────────────
//
// The server refuses to turn on a campaign with no goal, and refuses to activate
// one whose page-counting step has no page. Those are good rules and a 400 is a
// bad way to learn them, so the button is disabled with the reason written
// beside it. The server check stays: this is the explanation, not the guard.

import { useEffect, useState } from 'react';
import {
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
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Pause, Play, ServerCrash, Trash2 } from 'lucide-react';
import { ConditionGroup, EMPTY_CONDITION_GROUP } from '@wizeworks/automation-schemas';
import { PANE_SHELL, PaneToolbar } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useActivePropertyId, useViewer } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { ConditionEditor } from '../automations/condition-editor';
import { LadderReport } from './ladder';
import { StageLadderEditor } from './stage-editor';
import {
  KIND_BLURB,
  KIND_LABEL,
  STALL_CHOICES,
  canEditCampaigns,
  formChoiceLabel,
  funnelErrorMessage,
  hoursLabel,
  statusMeta,
  useCreateFunnel,
  useDeleteFunnel,
  useFunnel,
  useSiteForms,
  useLadder,
  useUpdateFunnel,
  type FunnelKind,
  type FunnelStage,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const RANGE_DAYS = [7, 30, 90] as const;

/** The house column. A pane can be 1200px wide and a form still reads at ~700,
 *  so every editor in this app centres itself in the same `max-w-3xl`. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/**
 * A stored goal, or an empty group.
 *
 * PARSED, not cast. It used to duck-type on the presence of `conditions` and
 * cast, which meant the editor believed any JSON in that column and the server
 * did not: the server parses the same value with this schema and treats a
 * failure as no goal at all. So a campaign whose stored goal was malformed drew
 * a condition row with a raw operator slug in it and offered an enabled "Turn
 * it on" that the server would refuse — the editor showing something the
 * business owner cannot act on, above a button that lies.
 *
 * Falling back to the empty group is deliberate rather than lossy: a goal the
 * server cannot read is a goal the campaign does not have, and saying so is
 * what puts the owner in front of the one action that fixes it.
 */
function asGoal(value: unknown): ConditionGroup {
  const parsed = ConditionGroup.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_CONDITION_GROUP;
}

/* ── Creating one ─────────────────────────────────────────────────────────── */

/**
 * The new-campaign form: a name and what kind of thing it is, and nothing else.
 *
 * The kind picks the starting ladder, so choosing it well is worth a sentence
 * each — and everything else (the steps, the goal, what it is worth) is easier
 * to decide once there is a campaign on screen to decide it about.
 */
function NewCampaign({ ctx }: { ctx: SurfaceContext }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FunnelKind>('lead');
  const create = useCreateFunnel();
  // The RESOLVED site, not the raw cookie value — see useActivePropertyId. This
  // read the token directly, which is null for anybody who has never opened the
  // site switcher, and left "Create it" permanently disabled for them.
  const siteId = useActivePropertyId();
  const toast = useToast();

  useDirtySource(
    name.trim().length > 0 && !create.isSuccess,
    'This campaign has not been saved yet. Close anyway?'
  );

  const submit = () => {
    if (!siteId || !name.trim()) return;
    create.mutate(
      { propertyId: siteId, name: name.trim(), kind },
      {
        onSuccess: (funnel) => {
          toast.add({ title: `${funnel.name} created`, type: 'success' });
          // Replaces this pane rather than opening a second one: the thing that
          // was being created and the thing now being edited are one campaign.
          ctx.open('funnels.campaign', { id: funnel.id }, { target: 'replace' });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
          <Heading level={2} className="text-lg font-semibold">
            Start a campaign
          </Heading>

          <Field>
            <FieldLabel>What is it called?</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  placeholder="Spring service promotion"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              }
            />
          </Field>

          <Field>
            <FieldLabel>What is it for?</FieldLabel>
            <FieldControl
              render={
                <Select
                  color="module"
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value as FunnelKind);
                  }}
                  items={(Object.keys(KIND_LABEL) as FunnelKind[]).map((k) => ({
                    value: k,
                    label: KIND_LABEL[k],
                  }))}
                />
              }
            />
            <FieldDescription>{KIND_BLURB[kind]}</FieldDescription>
          </Field>

          {create.isError ? (
            <Text className="text-danger text-sm">
              {funnelErrorMessage(create.error, 'That campaign could not be created.')}
            </Text>
          ) : null}

          <div>
            <Button
              color="module"
              disabled={!name.trim() || !siteId || create.isPending}
              onClick={submit}
            >
              Create it
            </Button>
          </div>
          <Text className="text-sm">
            It starts as a draft and counts nobody until you turn it on.
          </Text>
        </div>
      </div>
    </div>
  );
}

/* ── The report half ──────────────────────────────────────────────────────── */

function ReportPanel({ id }: { id: string }) {
  const [days, setDays] = useState<number>(30);
  const ladder = useLadder(id, days);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <Heading level={2} className="text-lg font-semibold">
          How it is doing
        </Heading>
        <div className="flex-1" />
        <div className="w-40">
          <Select
            size="sm"
            aria-label="Report period"
            value={String(days)}
            onValueChange={(value) => {
              setDays(Number(value));
            }}
            items={RANGE_DAYS.map((d) => ({ value: String(d), label: `Last ${String(d)} days` }))}
          />
        </div>
      </header>

      {ladder.isPending ? (
        <p className="text-sm" role="status">
          Loading…
        </p>
      ) : ladder.isError ? (
        <Text className="text-sm">
          {funnelErrorMessage(ladder.error, 'The report could not be loaded just now.')}
        </Text>
      ) : ladder.data ? (
        <LadderReport ladder={ladder.data} />
      ) : null}
    </section>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function CampaignSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  if (id === 'new') return <NewCampaign ctx={ctx} />;
  return <ExistingCampaign ctx={ctx} id={id} />;
}

function ExistingCampaign({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const funnel = useFunnel(id);
  const forms = useSiteForms();
  const viewer = useViewer();
  const canEdit = canEditCampaigns(viewer.data?.role);
  const update = useUpdateFunnel(id);
  const remove = useDeleteFunnel();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [goal, setGoal] = useState<ConditionGroup>(EMPTY_CONDITION_GROUP);
  const [entryFormNodeId, setEntryFormNodeId] = useState<string | null>(null);
  const [stallAfterHours, setStallAfterHours] = useState<number | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the form once per campaign. Keyed on the row's `updatedAt` rather than
  // on mount so a refetch after a save re-syncs, while typing is never
  // interrupted by a background refresh.
  const stamp = funnel.data ? `${funnel.data.id}:${funnel.data.updatedAt}` : null;
  useEffect(() => {
    if (!funnel.data || stamp === loadedFor) return;
    setName(funnel.data.name);
    setDescription(funnel.data.description ?? '');
    setStages(funnel.data.stages);
    setGoal(asGoal(funnel.data.goal));
    setEntryFormNodeId(funnel.data.entryFormNodeId);
    setStallAfterHours(funnel.data.stallAfterHours);
    setLoadedFor(stamp);
    ctx.setTitle(funnel.data.name);
  }, [funnel.data, stamp, loadedFor, ctx]);

  const changed =
    funnel.data !== undefined &&
    (name !== funnel.data.name ||
      description !== (funnel.data.description ?? '') ||
      JSON.stringify(stages) !== JSON.stringify(funnel.data.stages) ||
      JSON.stringify(goal) !== JSON.stringify(asGoal(funnel.data.goal)) ||
      entryFormNodeId !== funnel.data.entryFormNodeId ||
      stallAfterHours !== funnel.data.stallAfterHours);

  useDirtySource(canEdit && changed, 'This campaign has unsaved changes. Close anyway?');

  if (funnel.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (funnel.isError || !funnel.data) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          icon={<ServerCrash className="size-6" aria-hidden />}
          error={funnel.error}
          noun="campaign"
          title="Could not open this campaign"
          description="This is a problem reaching the server. The campaign itself is unaffected — nothing has been changed or lost."
          onRetry={() => {
            void funnel.refetch();
          }}
        />
      </div>
    );
  }

  const current = funnel.data;
  const meta = statusMeta(current.status);
  const running = current.status === 'active';

  // The two things the server insists on before a campaign may run. Said here
  // so the answer arrives before the click, not as a 400 after it.
  const hasGoal = goal.conditions.length > 0;
  // Absent on a list row, present on the detail this pane fetches. Guarded
  // rather than defaulted: a wrong number here would teach the wrong thing
  // about what happens when nobody chooses.
  const defaultStall = current.defaultStallHours;
  const uncountable = stages.filter((s) => s.kind === 'view' && !s.path && !current.entryPageId);
  const blockedReason = !hasGoal
    ? 'Say what has to happen for this campaign to have worked, below, before you turn it on.'
    : uncountable.length > 0
      ? `Say which page counts as ${uncountable.map((s) => `"${s.name}"`).join(' and ')} before you turn it on.`
      : null;

  const save = () => {
    update.mutate(
      {
        name,
        description: description || null,
        stages,
        goal: hasGoal ? goal : null,
        entryFormNodeId,
        stallAfterHours,
      },
      { onSuccess: () => toast.add({ title: 'Campaign saved', type: 'success' }) }
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
      <PaneToolbar
        label="Campaign controls"
        status={<Text className="text-sm">{meta.note}</Text>}
        controls={
          <>
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button
                    size="sm"
                    color={running ? 'warning' : 'module'}
                    variant={running ? 'outline' : 'solid'}
                    disabled={update.isPending || (!running && blockedReason !== null)}
                    title={!running && blockedReason ? blockedReason : undefined}
                    onClick={() => {
                      setRunning(!running);
                    }}
                  >
                    {running ? (
                      <>
                        <Pause className="size-4" aria-hidden />
                        Pause it
                      </>
                    ) : (
                      <>
                        <Play className="size-4" aria-hidden />
                        Turn it on
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    color="module"
                    disabled={!changed || update.isPending}
                    onClick={save}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    color="danger"
                    variant="ghost"
                    shape="square"
                    aria-label="Delete this campaign"
                    onClick={() => {
                      void onDelete();
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </>
              ) : null}
            </div>
          </>
        }
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

          <FormSection
            title="What this campaign is"
            description="The name is yours, to recognise it by. Nobody outside your team sees either of these."
          >
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={name}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>What is it for?</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={description}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setDescription(event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="The steps"
            description="In order, from the first thing somebody does to the outcome you want. Renaming a step keeps everything it has already recorded."
          >
            <StageLadderEditor stages={stages} onChange={setStages} disabled={!canEdit} />
          </FormSection>

          <FormSection
            title="Where people come in"
            description="The form somebody fills in to join this campaign. Until one is chosen, the steps above can count visits but nobody ever joins."
          >
            <Field>
              <FieldLabel>The form that starts it</FieldLabel>
              <FieldControl
                render={
                  <Select
                    color="module"
                    aria-label="The form that starts it"
                    disabled={!canEdit || forms.data === undefined}
                    value={entryFormNodeId ?? 'none'}
                    onValueChange={(value) => {
                      setEntryFormNodeId(value === 'none' ? null : String(value));
                    }}
                    items={[
                      { value: 'none', label: 'Not connected to a form yet' },
                      ...(forms.data ?? []).map((form) => ({
                        value: form.formNodeId,
                        label: formChoiceLabel(form),
                      })),
                      // A campaign already pointed at something this site's form
                      // list does not contain — a deleted form, or one of the
                      // free tools on our own marketing sites, which are
                      // hand-built pages and have no form definition to list.
                      // Shown rather than silently dropped: without this the
                      // control would render "Not connected" over a campaign
                      // that IS connected, and saving would quietly cut it.
                      ...(entryFormNodeId &&
                      !(forms.data ?? []).some((f) => f.formNodeId === entryFormNodeId)
                        ? [{ value: entryFormNodeId, label: entryFormNodeId }]
                        : []),
                    ]}
                  />
                }
              />
              <FieldDescription>
                {entryFormNodeId === null
                  ? 'Nothing feeds this campaign yet, so it will not record anybody.'
                  : 'Every time somebody sends this form, they join the campaign.'}
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="What counts as success"
            description="Without this the campaign can only tell you what happened, not whether it worked, so it cannot be turned on."
          >
            <ConditionEditor
              value={goal}
              onChange={setGoal}
              label="people"
              emptyNote="Nothing chosen yet, so this campaign cannot be turned on. Add at least one thing that has to be true of somebody for it to have worked."
            />
          </FormSection>

          <FormSection
            title="When to give up on somebody"
            description="Somebody who starts and then goes quiet is not a failure yet, but at some point they are gone. This is how long to wait before saying so, which is what any follow-up you have set up waits for."
          >
            <Field>
              <FieldLabel>Give up after</FieldLabel>
              <FieldControl
                render={
                  <Select
                    color="module"
                    aria-label="Give up after"
                    disabled={!canEdit}
                    value={stallAfterHours === null ? 'default' : String(stallAfterHours)}
                    onValueChange={(value) => {
                      setStallAfterHours(value === 'default' ? null : Number(value));
                    }}
                    items={[
                      {
                        value: 'default',
                        label: defaultStall
                          ? `The usual for this kind of campaign (${hoursLabel(defaultStall)})`
                          : 'The usual for this kind of campaign',
                      },
                      ...STALL_CHOICES.map((hours) => ({
                        value: String(hours),
                        label: hoursLabel(hours),
                      })),
                    ]}
                  />
                }
              />
              <FieldDescription>
                {stallAfterHours === null
                  ? 'Every campaign of this kind waits the same amount of time. Choose a length to give this one its own.'
                  : 'This campaign waits longer or less than others of its kind, because you said so.'}
              </FieldDescription>
            </Field>
          </FormSection>

          {update.isError ? (
            <Text className="text-danger text-sm">
              {funnelErrorMessage(update.error, 'That change could not be saved.')}
            </Text>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default CampaignSurface;
