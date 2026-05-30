'use client';

// Pipeline editor — pipeline header + drag-and-drop stage list + add form.
// Reorder writes new sort_order in a single atomic transaction so the
// unique (pipeline_id, sort_order) index doesn't trip mid-move.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Stack,
  toast,
  useConfirm,
} from '@sparx/ui';

import {
  archivePipelineAction,
  reorderPipelineStagesAction,
  updatePipelineAction,
} from '../../../../pipeline-actions';
import { AddStageForm } from './add-stage-form';
import { PipelineHeaderCard, type PipelineHeader } from './pipeline-header-card';
import { SortableStageRow, type StageRow } from './stage-row';

interface PipelineEditorProps {
  pipeline: PipelineHeader & { stages: StageRow[] };
}

export function PipelineEditor({ pipeline }: PipelineEditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [stages, setStages] = React.useState<StageRow[]>(pipeline.stages);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = stages.findIndex((s) => s.id === active.id);
    const newIdx = stages.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const prev = stages;
    const next = arrayMove(stages, oldIdx, newIdx);
    setStages(next);

    startTransition(async () => {
      const result = await reorderPipelineStagesAction(pipeline.id, {
        stageIds: next.map((s) => s.id),
      });
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not reorder stages');
        setStages(prev);
        return;
      }
      toast.success('Order saved');
      router.refresh();
    });
  }

  function patchHeader(input: { name?: string; isDefault?: boolean }) {
    startTransition(async () => {
      const result = await updatePipelineAction(pipeline.id, input);
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not save pipeline');
        return;
      }
      toast.success('Pipeline updated');
      router.refresh();
    });
  }

  async function archive() {
    const ok = await confirm({
      title: 'Archive this pipeline?',
      description:
        'Existing deals stay on it, but new deals can no longer be added. You can restore it later.',
      confirmLabel: 'Archive pipeline',
      tone: 'warning',
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await archivePipelineAction(pipeline.id);
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not archive pipeline');
        return;
      }
      toast.success('Pipeline archived');
      router.push('/crm/pipelines');
    });
  }

  return (
    <Stack gap={6}>
      <PipelineHeaderCard
        pipeline={pipeline}
        onSave={patchHeader}
        onArchive={() => void archive()}
        pending={pending}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <Stack direction="row" align="center" gap={2}>
              Stages <Badge variant="outline">{stages.length}</Badge>
            </Stack>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <Stack gap={2}>
                {stages.map((s) => (
                  <SortableStageRow key={s.id} stage={s} pipelineId={pipeline.id} />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>

          <div className="mt-4 border-t border-[var(--color-border-default)] pt-4">
            <AddStageForm
              pipelineId={pipeline.id}
              nextSortOrder={stages.length}
              onAdded={() => router.refresh()}
            />
          </div>
        </CardContent>
      </Card>
    </Stack>
  );
}
