'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Pencil, Star, Trash } from 'lucide-react';

import { Badge, Button, Input, Label, Stack, Text, Textarea, useConfirm } from '@sparx/ui';

import {
  createCategoryAction,
  deleteCategoryAction,
  reparentCategoryAction,
  updateCategoryAction,
} from '../../category-actions';

export interface CategoryNode {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parentId: string | null;
  path: string;
  position: number;
  featured: boolean;
  productCount: number;
  depth: number;
  children: CategoryNode[];
}

interface TreeProps {
  tree: CategoryNode[];
}

// Tree view — collapsible rows with inline edit / reparent / delete.
// Reparent lives in the edit form (parent select); reorder uses the
// position field (no drag yet — Phase 1.3 ships keyboard + form
// affordances first, drag-and-drop in Phase 1.4 once the @sparx/ui
// SortableList primitive lands).

export function CategoriesEditor({ tree }: TreeProps) {
  const flat = React.useMemo(() => flattenTree(tree), [tree]);
  return (
    <Stack gap={0}>
      {tree.map((node) => (
        <TreeNode key={node.id} node={node} all={flat} />
      ))}
    </Stack>
  );
}

interface NewFormProps {
  tree: CategoryNode[];
}

export function NewCategoryForm({ tree }: NewFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const flat = React.useMemo(() => flattenTree(tree), [tree]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const handle = stringField(form.get('handle')).trim();
    const description = stringField(form.get('description')).trim();
    const parentId = stringField(form.get('parentId'));
    const featured = form.get('featured') === 'on';

    if (!name) {
      setFieldErrors({ name: 'Name is required.' });
      return;
    }

    const payload = {
      name,
      ...(handle ? { handle } : {}),
      ...(description ? { description } : {}),
      ...(parentId ? { parentId } : {}),
      featured,
    };

    startTransition(async () => {
      const result = await createCategoryAction(payload);
      if (!result.ok) {
        if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
          const fe: Record<string, string> = {};
          for (const d of result.error.details) fe[d.field] = d.message;
          setFieldErrors(fe);
        }
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={3}>
        <Stack direction="row" gap={3}>
          <Stack gap={1} className="flex-1">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" name="name" required placeholder="Engine parts" />
            {fieldErrors.name && (
              <Text size="xs" variant="danger">
                {fieldErrors.name}
              </Text>
            )}
          </Stack>
          <Stack gap={1} className="flex-1">
            <Label htmlFor="new-handle">Handle (optional)</Label>
            <Input id="new-handle" name="handle" placeholder="auto-derived from name" />
            {fieldErrors.handle && (
              <Text size="xs" variant="danger">
                {fieldErrors.handle}
              </Text>
            )}
          </Stack>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="new-parent">Parent</Label>
          <select
            id="new-parent"
            name="parentId"
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">— Top level —</option>
            {flat.map((n) => (
              <option key={n.id} value={n.id}>
                {indent(n.depth)}
                {n.name}
              </option>
            ))}
          </select>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="new-desc">Description</Label>
          <Textarea id="new-desc" name="description" rows={2} />
        </Stack>
        <Stack direction="row" align="center" gap={2}>
          <input type="checkbox" id="new-featured" name="featured" className="h-4 w-4" />
          <Label htmlFor="new-featured">Featured</Label>
        </Stack>
        {error && (
          <Text size="sm" variant="danger" role="alert" aria-live="polite">
            {error}
          </Text>
        )}
        <Stack direction="row" justify="end">
          <Button type="submit" variant="module" disabled={pending} loading={pending}>
            Create category
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

interface NodeProps {
  node: CategoryNode;
  all: CategoryNode[];
}

function TreeNode({ node, all }: NodeProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [expanded, setExpanded] = React.useState(node.depth <= 1);
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const hasChildren = node.children.length > 0;

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const handle = stringField(form.get('handle')).trim();
    const description = stringField(form.get('description')).trim();
    const positionRaw = stringField(form.get('position')).trim();
    const newParentId = stringField(form.get('parentId'));
    const featured = form.get('featured') === 'on';

    if (!name) {
      setError('Name is required.');
      return;
    }

    const position = Number.parseInt(positionRaw, 10);
    if (!Number.isFinite(position) || position < 0) {
      setError('Position must be a non-negative integer.');
      return;
    }

    startTransition(async () => {
      const updatePayload: Record<string, unknown> = {
        name,
        featured,
        ...(handle && handle !== node.handle ? { handle } : {}),
        description: description.length > 0 ? description : null,
      };
      const updateResult = await updateCategoryAction(node.id, updatePayload);
      if (!updateResult.ok) {
        setError(updateResult.error.message);
        return;
      }

      // Reparent / reorder runs through its own endpoint because path
      // rewriting is non-trivial; only call it when something actually
      // changed.
      const parentChanged = (newParentId || null) !== node.parentId;
      const positionChanged = position !== node.position;
      if (parentChanged || positionChanged) {
        const reparentResult = await reparentCategoryAction({
          categoryId: node.id,
          newParentId: newParentId.length > 0 ? newParentId : null,
          newPosition: position,
        });
        if (!reparentResult.ok) {
          setError(reparentResult.error.message);
          return;
        }
      }

      setEditing(false);
      router.refresh();
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete category "${node.name}"?`,
      description:
        'Products keep their other category bindings; the category itself archives (soft-delete) and can be restored from the archive view.',
      confirmLabel: 'Delete category',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCategoryAction(node.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  const parentOptions = all.filter((n) => n.id !== node.id && !n.path.startsWith(`${node.path}.`));

  return (
    <Stack
      gap={0}
      className="border-b border-[var(--color-border-default)] last:border-b-0"
      style={{ paddingLeft: `${node.depth * 1.5}rem` }}
    >
      <Stack direction="row" align="center" gap={2} className="py-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block h-4 w-4" aria-hidden />
        )}

        <Text size="sm" weight="medium" className="flex-1">
          {node.name}
        </Text>
        <Text size="xs" variant="muted">
          /{node.handle}
        </Text>
        {node.featured && (
          <Badge variant="outline" className="text-xs">
            <Star className="mr-1 h-3 w-3" />
            featured
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {node.productCount} product{node.productCount === 1 ? '' : 's'}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing((v) => !v)}
          leftIcon={<Pencil className="h-3.5 w-3.5" />}
          disabled={pending}
        >
          {editing ? 'Cancel' : 'Edit'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onDelete()}
          leftIcon={<Trash className="h-3.5 w-3.5" />}
          disabled={pending}
        >
          Delete
        </Button>
      </Stack>

      {editing && (
        <form onSubmit={onSave} className="px-6 pb-3">
          <Stack gap={3}>
            <Stack direction="row" gap={3}>
              <Stack gap={1} className="flex-1">
                <Label htmlFor={`edit-name-${node.id}`}>Name</Label>
                <Input id={`edit-name-${node.id}`} name="name" defaultValue={node.name} />
              </Stack>
              <Stack gap={1} className="flex-1">
                <Label htmlFor={`edit-handle-${node.id}`}>Handle</Label>
                <Input id={`edit-handle-${node.id}`} name="handle" defaultValue={node.handle} />
              </Stack>
              <Stack gap={1} className="w-24">
                <Label htmlFor={`edit-position-${node.id}`}>Position</Label>
                <Input
                  id={`edit-position-${node.id}`}
                  name="position"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={node.position}
                />
              </Stack>
            </Stack>
            <Stack gap={1}>
              <Label htmlFor={`edit-parent-${node.id}`}>Parent</Label>
              <select
                id={`edit-parent-${node.id}`}
                name="parentId"
                defaultValue={node.parentId ?? ''}
                className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              >
                <option value="">— Top level —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {indent(p.depth)}
                    {p.name}
                  </option>
                ))}
              </select>
            </Stack>
            <Stack gap={1}>
              <Label htmlFor={`edit-desc-${node.id}`}>Description</Label>
              <Textarea
                id={`edit-desc-${node.id}`}
                name="description"
                rows={2}
                defaultValue={node.description ?? ''}
              />
            </Stack>
            <Stack direction="row" align="center" gap={2}>
              <input
                type="checkbox"
                id={`edit-featured-${node.id}`}
                name="featured"
                defaultChecked={node.featured}
                className="h-4 w-4"
              />
              <Label htmlFor={`edit-featured-${node.id}`}>Featured</Label>
            </Stack>
            {error && (
              <Text size="xs" variant="danger" role="alert">
                {error}
              </Text>
            )}
            <Stack direction="row" justify="end" gap={2}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="module" size="sm" disabled={pending} loading={pending}>
                Save
              </Button>
            </Stack>
          </Stack>
        </form>
      )}

      {expanded && hasChildren && (
        <Stack gap={0}>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} all={all} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function flattenTree(tree: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  function walk(list: CategoryNode[]): void {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  }
  walk(tree);
  return out;
}

function indent(depth: number): string {
  return depth === 0 ? '' : `${'  '.repeat(depth)}↳ `;
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
