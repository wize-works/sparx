'use client';

// Section composition for a scoped layout (a SiteTemplate — home, a product /
// collection layout, or a CMS/custom slug page), wired to the editor shell's
// persistent canvas (Phase 2 §2.2, Phase 3 §7):
//   • add sections from the scope-restricted library, drag to reorder, toggle
//     visibility, remove;
//   • the library is filtered by the template's scope — a product layout offers
//     the bound product family + static sections, never a collection grid;
//   • editing a section opens a DOCKED inline editor in the inspector (never a
//     modal over the preview, per docs/30 §3); a BOUND section shows its
//     read-only data bindings above its editable presentation options;
//   • selection is two-way: clicking a section in the canvas opens its editor,
//     and the open section is outlined in the canvas;
//   • every mutation reloads the canvas so the preview reflects the saved draft.

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
  AlignLeft,
  ArrowLeft,
  Boxes,
  GripVertical,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Link2,
  Mail,
  Megaphone,
  MessageCircleQuestion,
  PanelTop,
  Quote,
  ShoppingBag,
  ShoppingCart,
  Star,
  Type,
  Wrench,
} from 'lucide-react';
import { Badge, Button, EmptyState, Modal, ModalContent, ModalHeader, ModalTitle } from '@sparx/ui';
import {
  SECTION_REGISTRY,
  sectionsForScope,
  type Scope,
  type SectionType,
} from '@sparx/sitebuilder-schemas';
import { createSection, removeSection, reorderSections, updateSection } from '../_lib/actions';
import type { SiteSectionDto } from '../_lib/types';
import { FieldControl } from './field-control';
import { useEditorCanvas } from './editor-shell';

// Maps a section definition's lucide icon name (from the schema registry) to a
// component for the visual add-section gallery. Falls back to a generic tile.
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Static
  Megaphone,
  ShoppingBag,
  LayoutGrid,
  Type,
  Image: ImageIcon,
  Quote,
  Mail,
  // Bound — product
  ShoppingCart,
  AlignLeft,
  Wrench,
  Star,
  MessageCircleQuestion,
  Boxes,
  // Bound — collection
  PanelTop,
  Grid3x3,
};

export interface SectionBuilderProps {
  /** The SiteTemplate these sections compose (Phase 3 — section parent FK). */
  templateId: string;
  /** The template's scope — restricts the section library + drives bindings. */
  scope: Scope;
  sections: SiteSectionDto[];
  /** Storefront path this layout renders at ("/" for home, "/<slug>" otherwise,
   *  a sample PDP/PLP for product/collection scopes). Points the shared canvas
   *  at the right page on mount. */
  previewPath?: string;
  /** When false, the parent owns the canvas path (e.g. the Layouts editor whose
   *  sample-item picker drives the preview). Defaults to true. */
  manageCanvasPath?: boolean;
}

export function SectionBuilder({
  templateId,
  scope,
  sections,
  previewPath = '/',
  manageCanvasPath = true,
}: SectionBuilderProps) {
  const router = useRouter();
  const canvas = useEditorCanvas();
  const [pending, startTransition] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const library = React.useMemo(() => sectionsForScope(scope), [scope]);

  const sorted = React.useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections]
  );
  // Local order so a drag reflects instantly; resynced when the server round-
  // trips fresh props back in (after reorderSections + router.refresh).
  const [items, setItems] = React.useState(sorted);
  React.useEffect(() => setItems(sorted), [sorted]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const editing = items.find((s) => s.id === editingId) ?? null;

  // Point the canvas at this layout (unless the parent owns the path).
  React.useEffect(() => {
    if (manageCanvasPath) canvas.setPreviewPath(previewPath);
  }, [canvas, previewPath, manageCanvasPath]);

  // Outline the open section in the canvas; clear on unmount.
  React.useEffect(() => {
    canvas.highlightSection(editingId);
  }, [canvas, editingId]);
  React.useEffect(() => () => canvas.highlightSection(null), [canvas]);

  // Canvas → inspector: a click in the preview opens that section's editor.
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  React.useEffect(
    () =>
      canvas.onSectionSelected(({ sectionId }) => {
        if (itemsRef.current.some((s) => s.id === sectionId)) setEditingId(sectionId);
      }),
    [canvas]
  );

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
      canvas.reload();
    });

  const add = (type: SectionType) => {
    setAdding(false);
    act(() => createSection({ templateId, sectionType: type }));
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
        templateId,
        next.map((s) => s.id)
      )
    );
  };

  // Docked editor — replaces the list while a section is selected.
  if (editing) {
    return (
      <InlineSectionEditor
        key={editing.id}
        section={editing}
        pending={pending}
        onBack={() => setEditingId(null)}
        onSave={(config) => act(() => updateSection(editing.id, { config }))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Sections</h2>
        <Button size="sm" onClick={() => setAdding(true)} disabled={pending}>
          Add section
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Add a hero, product grid, or other sections to compose this layout."
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
                  onEdit={() => setEditingId(s.id)}
                  onToggle={() => act(() => updateSection(s.id, { visible: !s.visible }))}
                  onRemove={() => act(() => removeSection(s.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add section library — scope-restricted (spec §7). */}
      <Modal open={adding} onOpenChange={setAdding}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Add a section</ModalTitle>
          </ModalHeader>
          <BoundLegend />
          <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto py-2 sm:grid-cols-2">
            {library.map((def) => {
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
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        {def.label}
                      </span>
                      {def.binding ? (
                        <Badge color="module" variant="soft" size="sm">
                          Bound
                        </Badge>
                      ) : null}
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
    </div>
  );
}

// Teaches the static-vs-bound distinction the gallery surfaces (doc 30 §4.2):
// a bound section's CONTENT comes from the page's assigned item at render.
function BoundLegend() {
  return (
    <p className="text-xs text-[var(--color-text-muted)]">
      <span className="font-medium text-[var(--color-text-primary)]">Bound</span> sections pull
      their content from the page&apos;s product or collection automatically; the rest use the
      content you enter here.
    </p>
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
      className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-default)] px-3 py-2.5"
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

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--color-text-primary)]">
          {def?.label ?? section.sectionType}
          {def?.binding ? (
            <Badge color="module" variant="soft" size="sm">
              Bound
            </Badge>
          ) : null}
          {!section.visible ? (
            <span className="text-xs text-[var(--color-text-muted)]">(hidden)</span>
          ) : null}
        </p>
        <p className="truncate text-xs text-[var(--color-text-muted)]">{def?.description}</p>
      </button>

      <Button size="sm" variant="ghost" onClick={onToggle} disabled={pending}>
        {section.visible ? 'Hide' : 'Show'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onRemove} disabled={pending}>
        Delete
      </Button>
    </li>
  );
}

function InlineSectionEditor({
  section,
  pending,
  onBack,
  onSave,
}: {
  section: SiteSectionDto;
  pending: boolean;
  onBack: () => void;
  onSave: (config: Record<string, unknown>) => void;
}) {
  const def = SECTION_REGISTRY[section.sectionType as SectionType];
  const [config, setConfig] = React.useState<Record<string, unknown>>(section.config ?? {});
  const bindings = def?.bindings ?? [];

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Sections
      </button>
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
        {def?.label ?? 'Section'}
      </h2>

      {/* Bound section: its data sources, read-only (spec §7 "Data bindings"). */}
      {bindings.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3">
          <p className="text-xs font-medium tracking-wider text-[var(--color-text-muted)] uppercase">
            Data bindings
          </p>
          <ul className="flex flex-col gap-1">
            {bindings.map((b) => (
              <li key={b.path} className="flex items-center gap-2 text-sm">
                <Link2 className="h-3.5 w-3.5 flex-none text-[var(--module-active)]" />
                <span className="text-[var(--color-text-primary)]">{b.label}</span>
                <span className="truncate font-mono text-xs text-[var(--color-text-muted)]">
                  {b.path}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--color-text-muted)]">
            Pulled from the page&apos;s {def?.binding} automatically — not editable here.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {(def?.fields ?? []).map((f) => (
          <FieldControl
            key={f.key}
            field={f}
            value={config[f.key]}
            onChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
          />
        ))}
      </div>
      <Button className="self-start" onClick={() => onSave(config)} disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  );
}
