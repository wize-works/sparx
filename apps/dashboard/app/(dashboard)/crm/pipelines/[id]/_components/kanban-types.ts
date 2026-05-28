// Shared shapes for the Kanban view. Lives in its own module so the
// client components don't have to import each other transitively for
// type-only data and we can keep each component file small.

export interface KanbanStage {
  id: string;
  name: string;
  color: string | null;
  stageType: string;
  probability: number;
  count: number;
}

export interface KanbanDeal {
  id: string;
  title: string;
  stageId: string;
  value: number;
  currency: string;
  probability: number;
  assignedRepId: string | null;
  expectedCloseDate: string | null;
  tags: string[];
}

export function stageColor(stage: Pick<KanbanStage, 'color' | 'stageType'>): string {
  if (stage.color) return stage.color;
  if (stage.stageType === 'won') return 'var(--color-success-500)';
  if (stage.stageType === 'lost') return 'var(--color-danger-500)';
  return 'var(--module-active)';
}
