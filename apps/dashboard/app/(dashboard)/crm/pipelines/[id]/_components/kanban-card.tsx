'use client';

// A single deal card on the Kanban board. Hooked into useDraggable so the
// parent DndContext can pick it up. We render a click-through link to
// /crm/deals/[id] in normal state; during drag we suppress the link via
// pointer-events so the drag doesn't accidentally navigate.
//
// The label uses EntityRowLink so plain click honours the user's default
// detail view preference (drawer / modal / full page / new tab) without
// taking the user off the Kanban board for in-flight deal review.

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar } from 'lucide-react';

import { Badge, Stack, Text } from '@sparx/ui';

import { EntityRowLink } from '../../../../_components/entity-row-link';
import { type KanbanDeal } from './kanban-types';

interface KanbanCardProps {
  deal: KanbanDeal;
  dragging?: boolean;
}

export function KanbanCard({ deal, dragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-3 shadow-sm ${
        dragging ? 'ring-2 ring-[var(--module-active)]' : 'hover:border-[var(--module-active)]'
      }`}
    >
      <Stack gap={2}>
        <Stack direction="row" align="start" justify="between" gap={2}>
          {dragging ? (
            <Text size="sm" weight="medium" className="truncate">
              {deal.title}
            </Text>
          ) : (
            <EntityRowLink
              href={`/crm/deals/${deal.id}`}
              entityType="deal"
              entityId={deal.id}
              className="truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--module-active)] hover:underline"
              onClick={(e) => isDragging && e.preventDefault()}
            >
              {deal.title}
            </EntityRowLink>
          )}
          <Text size="xs" variant="muted" className="tabular-nums">
            ${deal.value.toLocaleString()}
          </Text>
        </Stack>
        <Stack direction="row" gap={1} wrap>
          <Badge variant="outline" className="text-xs">
            {deal.probability}%
          </Badge>
          {deal.expectedCloseDate && (
            <Badge variant="outline" className="text-xs">
              <Calendar className="h-3 w-3" />
              {new Date(deal.expectedCloseDate).toLocaleDateString()}
            </Badge>
          )}
          {deal.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </Stack>
      </Stack>
    </div>
  );
}
