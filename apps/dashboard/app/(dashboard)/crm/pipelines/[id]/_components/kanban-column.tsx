'use client';

// One Kanban column = one pipeline stage. The drop target is the column
// body; useDroppable wires it into the surrounding DndContext.

import { useDroppable } from '@dnd-kit/core';

import { Badge, Stack, Text } from '@sparx/ui';

import { KanbanCard } from './kanban-card';
import { type KanbanDeal, type KanbanStage, stageColor } from './kanban-types';

interface KanbanColumnProps {
  stage: KanbanStage;
  deals: KanbanDeal[];
}

export function KanbanColumn({ stage, deals }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const stageValue = deals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] p-3 transition-colors ${
        isOver ? 'border-[var(--module-active)] bg-[var(--module-active-soft)]' : ''
      }`}
    >
      <Stack gap={3}>
        <Stack direction="row" align="center" justify="between">
          <Stack direction="row" align="center" gap={2}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stageColor(stage) }} />
            <Text size="sm" weight="medium">
              {stage.name}
            </Text>
            <Badge variant="outline" className="text-xs">
              {deals.length}
            </Badge>
          </Stack>
          <Text size="xs" variant="muted">
            {stage.probability}%
          </Text>
        </Stack>
        <Text size="xs" variant="muted">
          ${stageValue.toLocaleString()}
        </Text>
        <Stack gap={2} className="min-h-[120px]">
          {deals.map((deal) => (
            <KanbanCard key={deal.id} deal={deal} />
          ))}
        </Stack>
      </Stack>
    </div>
  );
}
