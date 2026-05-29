'use client';

// Hierarchical menu editor.
//
// Each item is keyed by a client-side `uid` (so React can reconcile while
// the user reorders), tracks link kind (entry vs external), label, and an
// optional `children` array. On save we strip uids and POST the tree as
// the api-rest PUT body.
//
// Drag-and-drop is intentionally out of scope for the first cut — the
// move-up/move-down buttons cover 90% of editor intent and ship without a
// dependency on @dnd-kit / react-beautiful-dnd. The structure here makes
// the eventual swap trivial: items[] reorder + setItems() is the whole
// move primitive.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from 'lucide-react';
import { saveMenu } from '../actions';

export interface EditableMenuItem {
  uid: string;
  label: string;
  kind: 'entry' | 'external';
  entryId: string | null;
  externalUrl: string | null;
  openInNewTab: boolean;
  children: EditableMenuItem[];
}

let uidCounter = 0;
const newUid = () => `mi-${Date.now()}-${++uidCounter}`;

function emptyItem(): EditableMenuItem {
  return {
    uid: newUid(),
    label: '',
    kind: 'external',
    entryId: null,
    externalUrl: '',
    openInNewTab: false,
    children: [],
  };
}

// Map editable tree → wire shape expected by api-rest PUT.
function toWireItems(items: EditableMenuItem[]): unknown[] {
  return items.map((item) => ({
    label: item.label,
    ...(item.kind === 'entry' && item.entryId ? { entry_id: item.entryId } : {}),
    ...(item.kind === 'external' && item.externalUrl ? { external_url: item.externalUrl } : {}),
    open_in_new_tab: item.openInNewTab,
    ...(item.children.length ? { children: toWireItems(item.children) } : {}),
  }));
}

interface PathStep {
  index: number;
}

// Recursive update helper — given a path of indices, runs `update` on
// the array at that depth. Returns a new tree (immutable update).
function updateAtPath(
  items: EditableMenuItem[],
  path: PathStep[],
  update: (siblings: EditableMenuItem[]) => EditableMenuItem[]
): EditableMenuItem[] {
  if (path.length === 0) return update(items);
  const [head, ...rest] = path;
  return items.map((item, i) =>
    i === head!.index ? { ...item, children: updateAtPath(item.children, rest, update) } : item
  );
}

export function MenuEditor({
  location,
  initialName,
  initialItems,
}: {
  location: string;
  initialName: string;
  initialItems: EditableMenuItem[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [items, setItems] = React.useState<EditableMenuItem[]>(initialItems);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  function addRoot() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function addChild(path: PathStep[]) {
    setItems((prev) =>
      updateAtPath(prev, path, (siblings) =>
        siblings.map((item, i) =>
          i === path[path.length - 1]!.index
            ? { ...item, children: [...item.children, emptyItem()] }
            : item
        )
      )
    );
  }

  function removeAt(path: PathStep[]) {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1]!.index;
    setItems((prev) =>
      updateAtPath(prev, parentPath, (siblings) => siblings.filter((_, i) => i !== childIndex))
    );
  }

  function moveAt(path: PathStep[], delta: -1 | 1) {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1]!.index;
    setItems((prev) =>
      updateAtPath(prev, parentPath, (siblings) => {
        const target = childIndex + delta;
        if (target < 0 || target >= siblings.length) return siblings;
        const next = siblings.slice();
        const [moved] = next.splice(childIndex, 1);
        next.splice(target, 0, moved!);
        return next;
      })
    );
  }

  function patchAt(path: PathStep[], patch: Partial<EditableMenuItem>) {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1]!.index;
    setItems((prev) =>
      updateAtPath(prev, parentPath, (siblings) =>
        siblings.map((item, i) => (i === childIndex ? { ...item, ...patch } : item))
      )
    );
  }

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveMenu(location, {
        name,
        items: toWireItems(items) as never,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not save menu.');
        return;
      }
      setMessage('Saved.');
      router.refresh();
    });
  }

  return (
    <Stack gap={5}>
      <Card>
        <CardHeader>
          <Heading level={3}>Menu name</Heading>
          <CardDescription>
            Internal label so editors recognise the menu in the listing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap={2}>
            <Label htmlFor="menu-name">Name</Label>
            <Input id="menu-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack direction="row" align="center" justify="between">
            <Stack gap={1}>
              <Heading level={3}>Items</Heading>
              <CardDescription>{items.length} top-level items</CardDescription>
            </Stack>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={addRoot}
            >
              Add item
            </Button>
          </Stack>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <Text variant="muted">No items yet. Click “Add item” to start the tree.</Text>
          ) : (
            <ItemList
              items={items}
              path={[]}
              onPatch={patchAt}
              onAddChild={addChild}
              onRemove={removeAt}
              onMove={moveAt}
            />
          )}
        </CardContent>
        <CardFooter>
          <Stack direction="row" align="center" gap={3}>
            <Button
              type="button"
              variant="module"
              leftIcon={<Save className="h-4 w-4" />}
              onClick={onSave}
              disabled={pending}
              loading={pending}
            >
              Save menu
            </Button>
            {error && (
              <Text size="sm" variant="danger" role="alert">
                {error}
              </Text>
            )}
            {message && (
              <Text size="sm" variant="success">
                {message}
              </Text>
            )}
          </Stack>
        </CardFooter>
      </Card>
    </Stack>
  );
}

function ItemList({
  items,
  path,
  onPatch,
  onAddChild,
  onRemove,
  onMove,
}: {
  items: EditableMenuItem[];
  path: PathStep[];
  onPatch: (path: PathStep[], patch: Partial<EditableMenuItem>) => void;
  onAddChild: (path: PathStep[]) => void;
  onRemove: (path: PathStep[]) => void;
  onMove: (path: PathStep[], delta: -1 | 1) => void;
}) {
  return (
    <Stack gap={2}>
      {items.map((item, index) => {
        const itemPath: PathStep[] = [...path, { index }];
        return (
          <div
            key={item.uid}
            style={{
              border: '1px solid var(--color-border-default)',
              borderRadius: '0.5rem',
              padding: '0.75rem',
            }}
          >
            <Stack gap={3}>
              <Stack direction="row" align="end" gap={2}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor={`label-${item.uid}`}>Label</Label>
                  <Input
                    id={`label-${item.uid}`}
                    value={item.label}
                    onChange={(e) => onPatch(itemPath, { label: e.target.value })}
                    placeholder="Display label"
                  />
                </Stack>
                <Stack direction="row" gap={1}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon={<ChevronUp className="h-3 w-3" />}
                    onClick={() => onMove(itemPath, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon={<ChevronDown className="h-3 w-3" />}
                    onClick={() => onMove(itemPath, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Move down"
                  >
                    Down
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon={<Trash2 className="h-3 w-3" />}
                    onClick={() => onRemove(itemPath)}
                    aria-label="Remove"
                  >
                    Remove
                  </Button>
                </Stack>
              </Stack>

              <Stack direction="row" gap={3}>
                <Stack gap={1}>
                  <Label htmlFor={`kind-${item.uid}`}>Link kind</Label>
                  <select
                    id={`kind-${item.uid}`}
                    value={item.kind}
                    onChange={(e) =>
                      onPatch(itemPath, {
                        kind: e.target.value as 'entry' | 'external',
                        // Clear the other side so the XOR constraint never breaks.
                        ...(e.target.value === 'entry' ? { externalUrl: '' } : { entryId: null }),
                      })
                    }
                    className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm"
                  >
                    <option value="external">External URL</option>
                    <option value="entry">CMS entry</option>
                  </select>
                </Stack>
                <Stack gap={1} className="flex-1">
                  {item.kind === 'entry' ? (
                    <>
                      <Label htmlFor={`target-${item.uid}`}>Entry ID</Label>
                      <Input
                        id={`target-${item.uid}`}
                        value={item.entryId ?? ''}
                        onChange={(e) => onPatch(itemPath, { entryId: e.target.value || null })}
                        placeholder="UUID of a published content entry"
                      />
                    </>
                  ) : (
                    <>
                      <Label htmlFor={`target-${item.uid}`}>External URL</Label>
                      <Input
                        id={`target-${item.uid}`}
                        type="url"
                        value={item.externalUrl ?? ''}
                        onChange={(e) => onPatch(itemPath, { externalUrl: e.target.value })}
                        placeholder="https://…"
                      />
                    </>
                  )}
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor={`new-tab-${item.uid}`}>New tab</Label>
                  <input
                    id={`new-tab-${item.uid}`}
                    type="checkbox"
                    checked={item.openInNewTab}
                    onChange={(e) => onPatch(itemPath, { openInNewTab: e.target.checked })}
                    className="h-5 w-5"
                  />
                </Stack>
              </Stack>

              <Stack gap={2}>
                <Stack direction="row" align="center" justify="between">
                  <Text size="xs" variant="muted">
                    Children · {item.children.length}
                  </Text>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon={<Plus className="h-3 w-3" />}
                    onClick={() => onAddChild(itemPath)}
                  >
                    Add child
                  </Button>
                </Stack>
                {item.children.length > 0 && (
                  <div style={{ paddingLeft: '1.5rem' }}>
                    <ItemList
                      items={item.children}
                      path={itemPath}
                      onPatch={onPatch}
                      onAddChild={onAddChild}
                      onRemove={onRemove}
                      onMove={onMove}
                    />
                  </div>
                )}
              </Stack>
            </Stack>
          </div>
        );
      })}
    </Stack>
  );
}
