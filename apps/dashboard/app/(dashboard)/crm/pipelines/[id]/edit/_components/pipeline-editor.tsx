'use client';

// Pipeline editor — pipeline header + drag-and-drop stage list + add form.
// Reorder writes new sort_order in a single atomic transaction so the
// unique (pipeline_id, sort_order) index doesn't trip mid-move.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Archive } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Stack,
  Text,
  toast,
} from '@sparx/ui';

import {
  archivePipelineAction,
  reorderPipelineStagesAction,
  updatePipelineAction,
} from '../../../../pipeline-actions';
import { AddStageForm } from './add-stage-form';
import { SortableStageRow, type StageRow } from './stage-row';

interface PipelineEditorProps {
  pipeline: {
    id: string;
    name: string;
    slug: string;
    isDefault: boolean;
    archivedAt: string | null;
    stages: StageRow[];
  };
}

export function PipelineEditor({ pipeline }: PipelineEditorProps) {
  const router = useRouter();
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

  function archive() {
    if (!confirm('Archive this pipeline? Existing deals stay on it; new deals can no longer be added.')) {
      return;
    }
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
        onArchive={archive}
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
                  <SortableStageRow key={s.id} stage={s} />
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

function PipelineHeaderCard({
  pipeline,
  onSave,
  onArchive,
  pending,
}: {
  pipeline: PipelineEditorProps['pipeline'];
  onSave: (input: { name?: string; isDefault?: boolean }) => void;
  onArchive: () => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState(pipeline.name);
  const [isDefault, setIsDefault] = React.useState(pipeline.isDefault);
  const dirty = name !== pipeline.name || isDefault !== pipeline.isDefault;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Header</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack gap={4}>
          <Stack direction="row" gap={4}>
            <Stack gap={2} className="flex-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Stack>
            <Stack gap={2} className="w-64">
              <Label>Slug</Label>
              <Input value={pipeline.slug} disabled />
              <Text size="xs" variant="muted">
                Slug is immutable to keep URLs stable.
              </Text>
            </Stack>
          </Stack>
          <Stack direction="row" align="center" gap={2}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4"
              id="isDefault-edit"
            />
            <Label htmlFor="isDefault-edit">Default pipeline</Label>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button
              variant="module"
              size="sm"
              disabled={!dirty || pending}
              onClick={() => onSave({ name, isDefault })}
            >
              Save header
            </Button>
            {!pipeline.archivedAt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onArchive}
                disabled={pending}
                leftIcon={<Archive className="h-3.5 w-3.5" />}
              >
                Archive pipeline
              </Button>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
