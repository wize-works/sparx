'use client';

// Sortable stage row — name + probability + stage type editor with a
// drag handle. updatePipelineStageAction fires on Save.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { Button, Input, Stack, toast } from '@sparx/ui';

import { updatePipelineStageAction } from '../../../../pipeline-actions';

export interface StageRow {
  id: string;
  name: string;
  sortOrder: number;
  probability: number;
  stageType: 'open' | 'won' | 'lost';
  color: string | null;
}

const SELECT_CLASS =
  'flex h-9 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export function SortableStageRow({ stage }: { stage: StageRow }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: stage.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [name, setName] = React.useState(stage.name);
  const [probability, setProbability] = React.useState(stage.probability);
  const [stageType, setStageType] = React.useState<'open' | 'won' | 'lost'>(stage.stageType);
  const dirty =
    name !== stage.name || probability !== stage.probability || stageType !== stage.stageType;
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const result = await updatePipelineStageAction(stage.id, {
        name,
        probability,
        stageType,
      });
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not save stage');
        return;
      }
      toast.success('Stage saved');
      router.refresh();
    });
  }

  return (
    <Stack
      direction="row"
      align="center"
      gap={3}
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-[var(--color-border-default)] p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-[var(--color-text-tertiary)] hover:text-[var(--module-active)]"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
        placeholder="Stage name"
      />
      <Input
        type="number"
        min="0"
        max="100"
        value={probability}
        onChange={(e) => setProbability(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        className="w-24"
      />
      <select
        value={stageType}
        onChange={(e) => setStageType(e.target.value as 'open' | 'won' | 'lost')}
        className={SELECT_CLASS}
      >
        <option value="open">Open</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>
      <Button variant="module" size="sm" disabled={!dirty || pending} onClick={save}>
        Save
      </Button>
    </Stack>
  );
}
