'use client';

// Keyboard-accessible deal-stage picker. The kanban board uses pointer-only
// @dnd-kit drag handles to move a deal between stages — that's the only
// existing path. This component adds a native <select> equivalent so
// keyboard-only users (and anyone on a touch device that doesn't get along
// with the kanban) have a path to the same `moveDealStageAction`.

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { toast } from '@sparx/ui';

import { moveDealStageAction } from '../../../deal-actions';

interface StageOption {
  id: string;
  name: string;
  probability: number;
}

interface StagePickerProps {
  dealId: string;
  currentStageId: string;
  stages: StageOption[];
}

const SELECT_CLASS =
  'h-7 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export function StagePicker({ dealId, currentStageId, stages }: StagePickerProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [optimisticStageId, setOptimisticStageId] = React.useState(currentStageId);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === optimisticStageId) return;
    const previous = optimisticStageId;
    const target = stages.find((s) => s.id === next);
    setOptimisticStageId(next);

    startTransition(async () => {
      const result = await moveDealStageAction(dealId, { toStageId: next });
      if (!result.ok) {
        setOptimisticStageId(previous);
        toast.error(result.error.message ?? 'Could not move deal');
        return;
      }
      toast.success(target ? `Moved to ${target.name}` : 'Deal moved');
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Move to stage</span>
      <select
        className={SELECT_CLASS}
        value={optimisticStageId}
        onChange={onChange}
        disabled={pending}
        aria-label="Move deal to stage"
      >
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name} · {stage.probability}%
          </option>
        ))}
      </select>
    </label>
  );
}
