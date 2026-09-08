'use client';

// SAVED VIEWS + THE COLUMN CHOOSER (docs/146 Phase 10.2).
//
// Two controls that belong together because they answer the same complaint:
// "this list nearly shows me what I need". One narrows the rows, the other
// chooses the columns, and a person who has got a list exactly right wants to
// come back to it tomorrow without rebuilding it.
//
// ── Why the view is a snapshot of FILTERS and not of ROWS ────────────────
//
// A saved view stores the query — the filters, the sort, the chosen columns —
// and never the rows it produced. That is what makes "Running low at the
// warehouse" mean the same thing in March as it did in January: it is a
// question, re-asked, not an answer preserved.
//
// ── Shared or mine ───────────────────────────────────────────────────────
//
// A shared view is visible to the whole team and editable by any of them; a
// private one belongs to whoever made it. Both live in the same list because
// the distinction matters at the moment of SAVING and almost never afterwards,
// and a segmented "my views / team views" control makes people hunt in two
// places for something they only half remember naming.
//
// ── The column chooser is not a preference, it is part of the view ───────
//
// Columns ride in the same saved config as the filters. A view called "What to
// chase up" that brings back the reorder point and the supplier is a different
// and more useful thing than one that only filters — and storing columns
// separately, per user per list, is how the same person gets different columns
// on two machines.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldLabel,
  Input,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, Columns3, Star, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from '../lib/api/client';
import { afterCommit, afterMenuClose } from '../lib/defer';
import { useConfirm } from '../lib/confirm';
import { MENU_ROW, type ToolbarPresentation } from './toolbar-presentation';

export interface SavedViewConfig {
  /** The list's own filter vocabulary, as strings. Opaque here on purpose: a
   *  new filter on any list must never need a change in this component. */
  params: Record<string, string>;
}

export interface SavedView {
  id: string;
  target: string;
  name: string;
  config: SavedViewConfig;
  isDefault: boolean;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One column a list can show. `required` marks the one or two that identify a
 *  row — a table with no name column is a grid of numbers. */
export interface ColumnOption {
  key: string;
  label: string;
  required?: boolean;
}

const savedViewKeys = {
  list: (target: string) => ['saved-views', target] as const,
};

export function useSavedViews(target: string) {
  return useQuery({
    queryKey: savedViewKeys.list(target),
    queryFn: () => api.get<{ items: SavedView[] }>('/v1/saved-views', { target }),
    staleTime: 60_000,
  });
}

function useInvalidateViews(target: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: savedViewKeys.list(target) });
  };
}

export interface SavedViewsBarProps {
  /** The list's identity — a route path, e.g. `/inventory/stock`. Persisted, so
   *  changing it orphans every view somebody saved. */
  target: string;
  /** What the list is showing right now, as plain strings. */
  params: Record<string, string>;
  /** Apply a view: the list re-reads its own state from these. */
  onApply: (params: Record<string, string>) => void;
  /** Every column the list CAN show, in display order. Omit to hide the column
   *  chooser on a list whose columns are fixed. */
  columns?: ColumnOption[];
  /** Which are showing. */
  visibleColumns?: string[];
  onColumnsChange?: (keys: string[]) => void;
  /** Layout only — the toolbar's `ml-auto` when this is the first control of
   *  the right-hand group. */
  className?: string;
  /** `menu` relocates both controls into PaneToolbar's overflow popover, where
   *  there is no hover to reveal a tooltip so each one wears its label. */
  presentation?: ToolbarPresentation;
}

/**
 * The views menu + the column chooser, for a list toolbar.
 *
 * Rendered as two small controls rather than one combined menu: choosing a
 * saved view is something people do constantly and choosing columns is
 * something they do once, and burying the frequent action inside the rare one
 * is how a feature goes unused.
 */
export function SavedViewsBar({
  target,
  params,
  onApply,
  columns,
  visibleColumns,
  onColumnsChange,
  className,
  presentation = 'bar',
}: SavedViewsBarProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const views = useSavedViews(target);
  const invalidate = useInvalidateViews(target);

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);

  const create = useMutation({
    mutationFn: (input: {
      target: string;
      name: string;
      config: SavedViewConfig;
      shared: boolean;
      isDefault: boolean;
    }) => api.post<SavedView>('/v1/saved-views', input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/v1/saved-views/${id}`),
    onSuccess: invalidate,
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.post<SavedView>(`/v1/saved-views/${id}/default`, {}),
    onSuccess: invalidate,
  });

  // Memoised because the `activeId` lookup below depends on it, and a fresh []
  // on every render would re-run that comparison on every keystroke elsewhere in
  // the toolbar.
  const items = useMemo(() => views.data?.items ?? [], [views.data]);

  // Which saved view, if any, the list is currently showing. Compared on the
  // params themselves rather than on an id held in state, so the highlight is
  // right after a back/forward or a shared link as well as after a click.
  const activeId = useMemo(() => {
    const current = JSON.stringify(normalise(params));
    return items.find((view) => JSON.stringify(normalise(view.config.params)) === current)?.id;
  }, [items, params]);

  const activeName = items.find((view) => view.id === activeId)?.name;
  const hasFilters = Object.values(params).some((value) => value !== '');

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          {presentation === 'menu' ? (
            <Button
              size="sm"
              variant="ghost"
              className={MENU_ROW}
              {...(activeId ? { color: 'module' as const } : {})}
            >
              <Star className="size-4" aria-hidden />
              <span>{activeName ?? 'Saved views'}</span>
              {items.length > 0 && !activeName ? (
                <Badge color="info" variant="soft" size="sm" className="ml-auto">
                  {items.length}
                </Badge>
              ) : null}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              aria-label={activeName ? `Saved views · showing "${activeName}"` : 'Saved views'}
              {...(className ? { className } : {})}
              {...(activeId ? { color: 'module' as const } : {})}
            >
              <Star className="size-4" aria-hidden />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {items.length === 0 ? (
            <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
          ) : (
            items.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => {
                  afterMenuClose(() => {
                    onApply(view.config.params);
                  });
                }}
              >
                {view.id === activeId ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <span className="size-4" aria-hidden />
                )}
                <span className="flex-1 truncate">{view.name}</span>
                {view.shared ? (
                  <Badge color="info" variant="soft" size="sm">
                    Team
                  </Badge>
                ) : null}
                {view.isDefault ? (
                  <Badge color="module" variant="soft" size="sm">
                    Opens here
                  </Badge>
                ) : null}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!hasFilters}
            onClick={() => {
              afterMenuClose(() => {
                setName('');
                setShared(false);
                setSaving(true);
              });
            }}
          >
            Save what I am looking at…
          </DropdownMenuItem>

          {activeId ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  afterMenuClose(() => {
                    setDefault.mutate(activeId, {
                      onSuccess: () => {
                        afterCommit(() => {
                          toast.add({ title: 'This list opens here now', type: 'success' });
                        });
                      },
                    });
                  });
                }}
              >
                <Star className="size-4" aria-hidden />
                Open this list here by default
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  afterMenuClose(() => {
                    void (async () => {
                      const ok = await confirm({
                        title: `Delete "${activeName ?? 'this view'}"?`,
                        description:
                          'The rows are untouched — this only forgets the saved question. Anyone on the team using a shared view will lose it too.',
                        confirmLabel: 'Delete it',
                        cancelLabel: 'Keep it',
                        color: 'danger',
                      });
                      if (!ok) return;
                      remove.mutate(activeId, {
                        onSuccess: () => {
                          afterCommit(() => {
                            toast.add({ title: 'Deleted', type: 'success' });
                          });
                        },
                      });
                    })();
                  });
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete this view
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {columns && visibleColumns && onColumnsChange ? (
        <ColumnChooser columns={columns} visible={visibleColumns} onChange={onColumnsChange} />
      ) : null}

      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <DialogTitle>Save this view</DialogTitle>
          <DialogDescription>
            What you are looking at right now — the filters, the sort and the columns — kept under a
            name. It saves the question, not the rows, so it stays true as the stock changes.
          </DialogDescription>
          <div className="flex flex-col gap-3 py-2">
            <Field>
              <FieldLabel>Call it</FieldLabel>
              <Input
                color="module"
                value={name}
                placeholder="Running low at the warehouse"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Share it with the team</FieldLabel>
              <Switch
                color="module"
                checked={shared}
                onCheckedChange={(checked) => {
                  setShared(checked);
                }}
              />
              <Text className="text-sm">
                {shared
                  ? 'Everyone will see it, and anyone can change or delete it.'
                  : 'Only you will see it.'}
              </Text>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              color="module"
              disabled={name.trim() === '' || create.isPending}
              onClick={() => {
                create.mutate(
                  {
                    target,
                    name: name.trim(),
                    config: {
                      params: {
                        ...normalise(params),
                        ...(visibleColumns ? { columns: visibleColumns.join(',') } : {}),
                      },
                    },
                    shared,
                    isDefault: false,
                  },
                  {
                    onSuccess: () => {
                      setSaving(false);
                      afterCommit(() => {
                        toast.add({ title: 'Saved', type: 'success' });
                      });
                    },
                    onError: () => {
                      afterCommit(() => {
                        toast.add({
                          title: 'Could not save it',
                          description: 'A view with that name already exists here.',
                          type: 'error',
                        });
                      });
                    },
                  }
                );
              }}
            >
              Save it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Which columns a list shows.
 *
 * A menu of checkboxes rather than a drag-to-reorder panel: order is the list
 * author's decision and reordering it per user makes two people describing the
 * same screen to each other describe different screens. What varies is WHICH,
 * not where.
 */
export function ColumnChooser({
  columns,
  visible,
  onChange,
}: {
  columns: ColumnOption[];
  visible: string[];
  onChange: (keys: string[]) => void;
}) {
  const hiddenCount = columns.filter(
    (column) => !column.required && !visible.includes(column.key)
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          size="sm"
          variant="ghost"
          {...(hiddenCount > 0 ? { color: 'module' as const } : {})}
        >
          <Columns3 className="size-4" aria-hidden />
          Columns
          {hiddenCount > 0 ? (
            <Badge color="module" variant="soft" size="sm">
              {columns.length - hiddenCount}/{columns.length}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {columns.map((column) => {
          const shown = column.required === true || visible.includes(column.key);
          return (
            <DropdownMenuItem
              key={column.key}
              // The menu stays open: choosing columns is a handful of decisions
              // in a row, and closing after each one turns four clicks into
              // twelve.
              closeOnClick={false}
              disabled={column.required === true}
              onClick={() => {
                if (column.required === true) return;
                onChange(
                  shown ? visible.filter((key) => key !== column.key) : [...visible, column.key]
                );
              }}
            >
              <Checkbox color="module" checked={shown} disabled={column.required === true} />
              <span className="flex-1 truncate">{column.label}</span>
              {column.required === true ? (
                <Badge color="info" variant="soft" size="sm">
                  Always
                </Badge>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Drop empty values so "filter cleared" and "filter never set" compare equal —
 *  otherwise a saved view never matches the list that produced it. */
function normalise(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

/** Read the column list out of a saved view's params, falling back to the
 *  list's own default set. Exported because every list applying a view needs
 *  the same reading of it. */
export function columnsFromView(params: Record<string, string>, fallback: string[]): string[] {
  const raw = params.columns;
  if (!raw) return fallback;
  const keys = raw.split(',').filter((key) => key !== '');
  return keys.length > 0 ? keys : fallback;
}
