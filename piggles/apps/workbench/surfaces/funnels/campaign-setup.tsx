'use client';

// The setup half of a campaign: its name, its steps, what counts as success,
// and how long it waits before calling somebody gone.

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  Text,
  Textarea,
} from '@wizeworks/silicaui-react';
import type { ConditionGroup } from '@wizeworks/automation-schemas';
import { FormSection } from '../../components/form-section';
import { ConditionEditor } from '../automations/condition-editor';
import { STALL_CHOICES, formChoiceLabel, hoursLabel } from './presentation';
import { useSiteForms } from './data';
import { StageLadderEditor } from './stage-editor';
import type { FunnelStage } from './types';

export interface SetupDraft {
  name: string;
  description: string;
  stages: FunnelStage[];
  goal: ConditionGroup;
  entryFormNodeId: string | null;
  stallAfterHours: number | null;
}

export interface SetupHandlers {
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  setStages: (value: FunnelStage[]) => void;
  setGoal: (value: ConditionGroup) => void;
  setEntryFormNodeId: (value: string | null) => void;
  setStallAfterHours: (value: number | null) => void;
}

function Identity({
  draft,
  on,
  canEdit,
}: {
  draft: SetupDraft;
  on: SetupHandlers;
  canEdit: boolean;
}) {
  return (
    <FormSection
      title="What this campaign is"
      description="The name is yours, to recognize it by. Nobody outside your team sees either of these."
    >
      <Field>
        <FieldLabel>Name</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={draft.name}
              disabled={!canEdit}
              onChange={(event) => {
                on.setName(event.target.value);
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
              value={draft.description}
              disabled={!canEdit}
              onChange={(event) => {
                on.setDescription(event.target.value);
              }}
            />
          }
        />
      </Field>
    </FormSection>
  );
}

function Entry({ draft, on, canEdit }: { draft: SetupDraft; on: SetupHandlers; canEdit: boolean }) {
  const forms = useSiteForms();
  const chosen = draft.entryFormNodeId;
  const listed = (forms.data ?? []).some((f) => f.formNodeId === chosen);

  return (
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
              value={chosen ?? 'none'}
              onValueChange={(value) => {
                on.setEntryFormNodeId(value === 'none' ? null : String(value));
              }}
              items={[
                { value: 'none', label: 'Not connected to a form yet' },
                ...(forms.data ?? []).map((form) => ({
                  value: form.formNodeId,
                  label: formChoiceLabel(form),
                })),
                // A campaign already pointed at something this site's form list
                // does not contain — a deleted form, or one of the free tools on
                // the marketing site, which are hand-built pages with no form
                // definition to list. Shown rather than silently dropped:
                // without this the control would read "Not connected" over a
                // campaign that IS connected, and saving would quietly cut it.
                ...(chosen && !listed ? [{ value: chosen, label: chosen }] : []),
              ]}
            />
          }
        />
        <FieldDescription>
          {chosen === null
            ? 'Nothing feeds this campaign yet, so it will not record anybody.'
            : 'Every time somebody sends this form, they join the campaign.'}
        </FieldDescription>
      </Field>
    </FormSection>
  );
}

function Patience({
  draft,
  on,
  canEdit,
  defaultStallHours,
}: {
  draft: SetupDraft;
  on: SetupHandlers;
  canEdit: boolean;
  defaultStallHours: number | undefined;
}) {
  const chosen = draft.stallAfterHours;
  return (
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
              value={chosen === null ? 'default' : String(chosen)}
              onValueChange={(value) => {
                on.setStallAfterHours(value === 'default' ? null : Number(value));
              }}
              items={[
                {
                  value: 'default',
                  label: defaultStallHours
                    ? `The usual for this kind of campaign (${hoursLabel(defaultStallHours)})`
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
          {chosen === null
            ? 'Every campaign of this kind waits the same amount of time. Choose a length to give this one its own.'
            : 'This campaign waits a different amount of time to others of its kind, because you said so.'}
        </FieldDescription>
      </Field>
    </FormSection>
  );
}

export function CampaignSetup({
  draft,
  on,
  canEdit,
  error,
  defaultStallHours,
}: {
  draft: SetupDraft;
  on: SetupHandlers;
  canEdit: boolean;
  error: string | null;
  defaultStallHours: number | undefined;
}) {
  return (
    <>
      <Identity draft={draft} on={on} canEdit={canEdit} />

      <FormSection
        title="The steps"
        description="In order, from the first thing somebody does to the outcome you want. Renaming a step keeps everything it has already recorded."
      >
        <StageLadderEditor stages={draft.stages} onChange={on.setStages} disabled={!canEdit} />
      </FormSection>

      <Entry draft={draft} on={on} canEdit={canEdit} />

      <FormSection
        title="What counts as success"
        description="Without this the campaign can only tell you what happened, not whether it worked, so it cannot be turned on."
      >
        <ConditionEditor
          value={draft.goal}
          onChange={on.setGoal}
          label="people"
          emptyNote="Nothing chosen yet, so this campaign cannot be turned on. Add at least one thing that has to be true of somebody for it to have worked."
        />
      </FormSection>

      <Patience draft={draft} on={on} canEdit={canEdit} defaultStallHours={defaultStallHours} />

      {error ? <Text className="text-danger text-sm">{error}</Text> : null}
    </>
  );
}
