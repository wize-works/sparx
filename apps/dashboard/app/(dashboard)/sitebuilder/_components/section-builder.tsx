'use client';

// Section composition editor for a page (pageKey "home" or a CMS page slug):
// add sections from the library, drag to reorder, toggle visibility, edit a
// section's settings in a modal, remove. Mutations call the server actions then
// refresh; reorder is optimistic — the list moves instantly, then persists and
// rolls back to the server order on the next refresh.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Mail,
  Megaphone,
  Quote,
  ShoppingBag,
  Type,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@sparx/ui';
import {
  SECTION_DEFINITIONS,
  SECTION_REGISTRY,
  type SectionType,
} from '@sparx/sitebuilder-schemas';
import { createSection, removeSection, reorderSections, updateSection } from '../_lib/actions';
import type { SiteSectionDto } from '../_lib/types';
import { FieldControl } from './field-control';

// Maps a section definition's lucide icon name (from the schema registry) to a
// component for the visual add-section gallery. Falls back to a generic tile.
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Megaphone,
  ShoppingBag,
  LayoutGrid,
  Type,
  Image: ImageIcon,
  Quote,
  Mail,
};

export interface SectionBuilderProps {
  pageKey: string;
  sections: SiteSectionDto[];
  /** Fired after any successful mutation so a parent (e.g. the live preview)
   *  can refresh. Optional — the editor works standalone without it. */
  onMutate?: () => void;
}

export function SectionBuilder({ pageKey, sections, onMutate }: SectionBuilderProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SiteSectionDto | null>(null);

  const sorted = React.useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections]
  );
  // Local order so a drag reflects instantly; resynced when the server round-
  // trips fresh props back in (after reorderSections + router.refresh).
  const [items, setItems] = React.useState(sorted);
  React.useEffect(() => setItems(sorted), [sorted]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
      onMutate?.();
    });

  const add = (type: SectionType) => {
    setAdding(false);
    act(() => createSection({ pageKey, sectionType: type }));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((s) => s.id === active.id);
    const newIdx = items.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next); // optimistic
    act(() =>
      reorderSections(
        pageKey,
        next.map((s) => s.id)
      )
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Sections</h2>
        <Button onClick={() => setAdding(true)} disabled={pending}>
          Add section
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Add a hero, product grid, or other sections to compose this page."
          action={
            <Button onClick={() => setAdding(true)} disabled={pending}>
              Add your first section
            </Button>
          }
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((s) => (
                <SortableSection
                  key={s.id}
                  section={s}
                  pending={pending}
                  onEdit={() => setEditing(s)}
                  onToggle={() => act(() => updateSection(s.id, { visible: !s.visible }))}
                  onRemove={() => act(() => removeSection(s.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add section library */}
      <Modal open={adding} onOpenChange={setAdding}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Add a section</ModalTitle>
          </ModalHeader>
          <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto py-2 sm:grid-cols-2">
            {SECTION_DEFINITIONS.map((def) => {
              const Icon = SECTION_ICONS[def.icon] ?? LayoutTemplate;
              return (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => add(def.type)}
                  className="flex items-start gap-3 rounded-lg border border-[var(--color-border-default)] p-3 text-left transition-colors hover:border-[var(--module-active)] hover:bg-[var(--color-bg-subtle)]"
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-[var(--color-bg-subtle)] text-[var(--module-active)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {def.label}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {def.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </ModalContent>
      </Modal>

      {/* Edit section settings */}
      {editing ? (
        <SectionEditor
          key={editing.id}
          section={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
            onMutate?.();
          }}
        />
      ) : null}
    </div>
  );
}

function SortableSection({
  section,
  pending,
  onEdit,
  onToggle,
  onRemove,
}: {
  section: SiteSectionDto;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const def = SECTION_REGISTRY[section.sectionType as SectionType];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-default)] px-3 py-2.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab text-[var(--color-text-muted)] hover:text-[var(--module-active)]"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          {def?.label ?? section.sectionType}
          {!section.visible ? (
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">(hidden)</span>
          ) : null}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">{def?.description}</p>
      </div>

      <Button size="sm" variant="ghost" onClick={onEdit} disabled={pending}>
        Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={onToggle} disabled={pending}>
        {section.visible ? 'Hide' : 'Show'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onRemove} disabled={pending}>
        Delete
      </Button>
    </li>
  );
}

function SectionEditor({
  section,
  onClose,
  onSaved,
}: {
  section: SiteSectionDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const def = SECTION_REGISTRY[section.sectionType as SectionType];
  const [config, setConfig] = React.useState<Record<string, unknown>>(section.config ?? {});
  const [pending, startTransition] = React.useTransition();

  const save = () =>
    startTransition(async () => {
      await updateSection(section.id, { config });
      onSaved();
    });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Edit {def?.label ?? 'section'}</ModalTitle>
        </ModalHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto py-2">
          {(def?.fields ?? []).map((f) => (
            <FieldControl
              key={f.key}
              field={f}
              value={config[f.key]}
              onChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
            />
          ))}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
