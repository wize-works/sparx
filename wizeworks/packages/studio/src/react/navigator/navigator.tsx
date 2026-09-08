'use client';

// The Navigator — the layer list.
//
// Two-way bound to the store: click a row and the canvas selects it; select on
// the canvas and the row highlights. Both read the same store, so there is no
// sync to keep and nothing to get out of step.
//
// Rows are drag sources AND drop targets, on the same rule the canvas uses — a
// list is always vertical, so the axis is fixed and only the container band
// differs. Sharing `dropPosition` rather than writing a second rule is what stops
// "drop between" meaning two different things in two places.
//
// And by finger as well as by mouse. The browser's drag-and-drop is never
// delivered by touch, so on a phone this rail could select a layer and rename it
// but not REORDER one — which left the order of a page fixed at whatever the
// order of adding had been. Press and hold a row to lift it.

import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Button, Input } from '@wizeworks/silicaui-react';
import type { TreeDoc } from '../../documents/types';
import { docKey } from '../../documents/types';
import { collectIds, findNode, findPlace } from '../../tree/walk';
import { useApply, useDoc, useDocSnapshot, useSelect, useSymbolNames } from '../context';
import { dropPosition, resolveDropTarget, type DropPosition, type Point } from '../canvas/drop';
import { useDragCargo, useDragSource, useDropZone } from '../drag/pointer-drag';
import { StudioIcon } from '../icon';
import { layerRows, type LayerDepth, type LayerRow } from './layer-tree';

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'source', 'track', 'wbr', 'embed', 'col']);

export function Navigator() {
  const doc = useDoc<TreeDoc>();
  const { selection } = useDocSnapshot();
  const apply = useApply();
  const select = useSelect();

  const [depth, setDepth] = useState<LayerDepth>('simple');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; where: DropPosition } | null>(null);
  const draggingRef = useRef<string | null>(null);
  const [list, setList] = useState<HTMLUListElement | null>(null);

  // The Navigator lists THIS document only. Chrome around a page body is another
  // document's tree, and listing it here would offer rows that refuse every edit.
  const symbolNames = useSymbolNames();
  const rows = useMemo(
    () => layerRows(doc.root, { depth, editableIds: collectIds(doc.root), symbolNames }),
    [doc.root, depth, symbolNames]
  );

  /**
   * The hint for a point over one row, or null if that row cannot take the drop.
   *
   * A point and an element rather than an event, for the same reason the canvas
   * takes them: a mouse drag names the row it is over, and a finger drag has its
   * pointer captured by the row it STARTED on, so the row underneath has to be
   * looked up. One rule, two inputs.
   */
  const hintAt = useCallback(
    (point: Point, element: HTMLElement | null, moving: string | null) => {
      const id = element?.dataset.layerId;
      if (!element || !id || !moving || moving === id) return null;
      const node = findNode(doc.root, id);
      if (!node) return null;
      const box = element.getBoundingClientRect();
      const canHold =
        node.kind === 'element' && !VOID_TAGS.has(node.tag.toLowerCase()) && !node.instanceOf;
      const where = dropPosition(
        point,
        { top: box.top, left: box.left, width: box.width, height: box.height },
        'y',
        { canHold, isEmpty: !(node.children ?? []).length }
      );
      return { id, where };
    },
    [doc.root]
  );

  /** Land a move. One path, whichever input started it. */
  const commit = useCallback(
    (hint: { id: string; where: DropPosition } | null, moving: string | null) => {
      setDropHint(null);
      if (!hint || !moving || moving === hint.id) return;

      const target = findPlace(doc.root, hint.id);
      const from = findPlace(doc.root, moving);
      if (!target) return;

      const resolved = resolveDropTarget(
        hint.where,
        {
          id: hint.id,
          ...(target.parent?.id ? { parentId: target.parent.id } : {}),
          indexInParent: target.index,
        },
        from
          ? {
              ...(from.parent?.id ? { parentId: from.parent.id } : {}),
              indexInParent: from.index,
            }
          : undefined
      );
      if (!resolved) return;
      apply('Move layer', [{ kind: 'node.move', id: moving, ...resolved }]);
    },
    [apply, doc.root]
  );

  const onRowDragStart = useCallback((event: DragEvent<HTMLLIElement>, row: LayerRow) => {
    if (row.locked) {
      event.preventDefault();
      return;
    }
    draggingRef.current = row.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', row.id);
  }, []);

  const onRowDragOver = useCallback(
    (event: DragEvent<HTMLLIElement>) => {
      const hint = hintAt(
        { x: event.clientX, y: event.clientY },
        event.currentTarget,
        draggingRef.current
      );
      if (!hint) return;
      event.preventDefault();
      setDropHint((current) =>
        current?.id === hint.id && current.where === hint.where ? current : hint
      );
    },
    [hintAt]
  );

  const onRowDrop = useCallback(
    (event: DragEvent<HTMLLIElement>) => {
      event.preventDefault();
      const moving = draggingRef.current;
      draggingRef.current = null;
      commit(hintAt({ x: event.clientX, y: event.clientY }, event.currentTarget, moving), moving);
    },
    [commit, hintAt]
  );

  // ---- the same gesture, by finger ---------------------------------------
  const surface = `${docKey(doc)}#layers`;
  const cargo = useDragCargo();
  const lifted = cargo?.surface === surface ? (cargo.moveId ?? null) : null;

  /** The row under a captured pointer. */
  const rowAt = useCallback((point: Point): HTMLElement | null => {
    const element = document.elementFromPoint(point.x, point.y);
    return element instanceof HTMLElement ? element.closest('[data-layer-id]') : null;
  }, []);

  const liftFrom = useCallback(
    (event: { target: EventTarget | null }) => {
      const row =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('[data-layer-id]')
          : null;
      const id = row?.dataset.layerId;
      // A locked row is the one thing here that does not lift — the Outlet a layout
      // is built around, which has exactly one legal place.
      if (!id || row?.dataset.layerLocked === 'true') return null;
      return { surface, moveId: id };
    },
    [surface]
  );
  const dragSource = useDragSource(liftFrom);

  useDropZone(list, {
    surface,
    onOver: (point, dragged) => {
      const hint = hintAt(point, rowAt(point), dragged.moveId ?? null);
      setDropHint(hint);
    },
    onLeave: () => setDropHint(null),
    onDrop: (point, dragged) =>
      commit(hintAt(point, rowAt(point), dragged.moveId ?? null), dragged.moveId ?? null),
  });

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const index = rows.findIndex((row) => row.id === selection[0]);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next =
          rows[
            Math.min(Math.max(index + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)
          ];
        if (next) select([next.id]);
      }
    },
    [rows, select, selection]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-base-300 flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-base-content text-sm font-medium">Layers</span>
        {/* A secondary control: neither `color` nor `variant`, so a bare `.btn`
            resolves to `base-content` and stays theme-correct in both modes. */}
        <Button
          size="sm"
          onClick={() => setDepth((current) => (current === 'simple' ? 'all' : 'simple'))}
        >
          {depth === 'simple' ? 'Show every layer' : 'Show main layers'}
        </Button>
      </div>

      {/* A real tree, not a list wearing click handlers. `role="tree"` + one
          `treeitem` per row is what makes arrow keys, the selected state and the
          nesting level reach a screen reader — a `<ul>` with `onClick` announces
          none of it, and the rail is the only way to reach a node that is
          scrolled off the canvas. */}
      <ul
        ref={setList}
        role="tree"
        aria-label="Layers"
        className="min-h-0 flex-1 overflow-auto p-1"
        tabIndex={0}
        onKeyDown={onKeyDown}
        {...dragSource}
      >
        {rows.map((row) => (
          <li
            key={row.id}
            role="treeitem"
            aria-selected={selection.includes(row.id)}
            aria-level={row.depth + 1}
            data-layer-id={row.id}
            data-layer-locked={row.locked ? 'true' : undefined}
            draggable={!row.locked}
            onDragStart={(event) => onRowDragStart(event, row)}
            onDragOver={onRowDragOver}
            onDragLeave={() => setDropHint(null)}
            onDrop={onRowDrop}
            onClick={() => select([row.id])}
            onDoubleClick={() => setRenaming(row.id)}
            onKeyDown={(event) => {
              // Enter selects, F2 renames — the same two things a double-click and a
              // click do, so the rail is fully usable without a pointer.
              if (event.key === 'Enter') select([row.id]);
              if (event.key === 'F2') setRenaming(row.id);
            }}
            className={rowClasses(
              row,
              selection.includes(row.id),
              dropHint?.id === row.id ? dropHint.where : null,
              lifted === row.id
            )}
          >
            <span className="shrink-0 pl-1" aria-hidden>
              <StudioIcon name={row.icon} className="text-base-content/70 inline-flex size-4" />
            </span>
            {renaming === row.id ? (
              <Input
                size="sm"
                // A ref rather than `autoFocus`: the field only exists because the
                // author just asked to rename this row, so moving focus into it is
                // following them rather than stealing from them — but `autoFocus` is
                // a page-load affordance and the rule against it is about that.
                ref={(node: HTMLInputElement | null) => node?.select()}
                defaultValue={row.label}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  setRenaming(null);
                  apply('Rename layer', [
                    { kind: 'node.setLabel', id: row.id, value: value || undefined },
                  ]);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span className="truncate text-sm">{row.label}</span>
            )}
            {row.locked ? (
              <StudioIcon
                name="lock"
                className="text-base-content/70 ml-auto inline-flex size-3.5"
              />
            ) : null}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-base-content px-3 py-6 text-sm">
            Nothing here yet. Add something from Insert.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Every class a literal string, so a consuming app's Tailwind scan safelists it. */
function rowClasses(
  row: LayerRow,
  selected: boolean,
  drop: string | null,
  lifted: boolean
): string {
  const indent = ['pl-2', 'pl-5', 'pl-8', 'pl-11', 'pl-14', 'pl-17', 'pl-20'];
  const base = [
    'flex cursor-pointer items-center gap-2 rounded py-1 pr-2',
    indent[Math.min(row.depth, indent.length - 1)] ?? 'pl-20',
  ];
  base.push(selected ? 'bg-primary text-primary-content' : 'hover:bg-base-200');
  if (drop === 'before') base.push('border-secondary border-t-2');
  if (drop === 'after') base.push('border-secondary border-b-2');
  if (drop === 'inside') base.push('outline-secondary outline outline-2 outline-dashed');
  if (!row.editable) base.push('opacity-60');
  // Faded because it is ELSEWHERE — held under a finger. This is the hole it left.
  if (lifted) base.push('opacity-50');
  return base.join(' ');
}
