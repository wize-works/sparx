'use client';

// Section composition editor for a page (pageKey "home" or a CMS page slug):
// add sections from the library, reorder (up/down — matches the CMS menu-editor
// convention), toggle visibility, edit a section's settings in a modal, remove.
// Mutations call the server actions then refresh.

import * as React from 'react';
import { useRouter } from 'next/navigation';
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

  const ordered = [...sections].sort((a, b) => a.position - b.position);

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

  const move = (index: number, dir: -1 | 1) => {
    const next = [...ordered];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
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

      {ordered.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Add a hero, product grid, or other sections to compose this page."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((s, i) => {
            const def = SECTION_REGISTRY[s.sectionType as SectionType];
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-default)] px-3 py-2.5"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0 || pending}
                    onClick={() => move(i, -1)}
                    className="text-[var(--color-text-muted)] disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === ordered.length - 1 || pending}
                    onClick={() => move(i, 1)}
                    className="text-[var(--color-text-muted)] disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {def?.label ?? s.sectionType}
                    {!s.visible ? (
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">(hidden)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">{def?.description}</p>
                </div>

                <Button size="sm" variant="ghost" onClick={() => setEditing(s)} disabled={pending}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => act(() => updateSection(s.id, { visible: !s.visible }))}
                  disabled={pending}
                >
                  {s.visible ? 'Hide' : 'Show'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => act(() => removeSection(s.id))}
                  disabled={pending}
                >
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add section library */}
      <Modal open={adding} onOpenChange={setAdding}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Add a section</ModalTitle>
          </ModalHeader>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto py-2">
            {SECTION_DEFINITIONS.map((def) => (
              <button
                key={def.type}
                type="button"
                onClick={() => add(def.type)}
                className="flex flex-col rounded-lg border border-[var(--color-border-default)] px-3 py-2.5 text-left hover:border-[var(--module-active)]"
              >
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {def.label}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{def.description}</span>
              </button>
            ))}
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
          <Button variant="secondary" onClick={onClose} disabled={pending}>
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
