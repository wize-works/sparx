'use client';

// Pipeline Kanban — drag-and-drop deal cards across stages.
//
// Drag is owned by @dnd-kit. Drop fires moveDealStageAction with optimistic
// local state; on server failure we roll back and toast. moveStage is the
// only sanctioned stage-change path so the deal.stage_changed event fires
// (locked decision #6 — the email automation engine subscribes to it).

import { useMemo, useState, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { toast } from '@sparx/ui';

import { moveDealStageAction } from '../../../deal-actions';
import { KanbanColumn } from './kanban-column';
import { KanbanCard } from './kanban-card';
import type { KanbanDeal, KanbanStage } from './kanban-types';

interface PipelineKanbanProps {
  pipelineId: string;
  stages: KanbanStage[];
  deals: KanbanDeal[];
}

export function PipelineKanban({
  pipelineId: _pipelineId,
  stages,
  deals: initial,
}: PipelineKanbanProps) {
  const [deals, setDeals] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dealsByStage = useMemo(() => groupByStage(stages, deals), [stages, deals]);
  const activeDeal = activeId ? (deals.find((d) => d.id === activeId) ?? null) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id);
    const over = event.over;
    setActiveId(null);
    if (!over) return;
    const targetStageId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    if (deal.stageId === targetStageId) return;
    const targetStage = stages.find((s) => s.id === targetStageId);
    if (!targetStage) return;

    const previousStageId = deal.stageId;
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stageId: targetStageId } : d)));

    startTransition(async () => {
      const result = await moveDealStageAction(dealId, { toStageId: targetStageId });
      if (!result.ok) {
        // Roll back optimistic update on server failure.
        setDeals((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, stageId: previousStageId } : d))
        );
        toast.error(result.error.message ?? 'Could not move deal');
        return;
      }
      toast.success(`Moved to ${targetStage.name}`);
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <KanbanColumn key={stage.id} stage={stage} deals={dealsByStage[stage.id] ?? []} />
        ))}
      </div>
      <DragOverlay>{activeDeal ? <KanbanCard deal={activeDeal} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function groupByStage(stages: KanbanStage[], deals: KanbanDeal[]): Record<string, KanbanDeal[]> {
  const out: Record<string, KanbanDeal[]> = {};
  for (const s of stages) out[s.id] = [];
  for (const d of deals) {
    const bucket = out[d.stageId];
    if (bucket) bucket.push(d);
  }
  return out;
}
