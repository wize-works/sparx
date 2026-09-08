'use client';

// Dashboards (docs/144 §8) — several saved reports on one screen.
//
// A board holds no numbers and no definitions: each widget points at a saved
// report and runs it live. That is why editing a report corrects every board it
// appears on, and why nothing here can drift out of date.
//
// Widgets are placed on a 12-column grid in SPANS, not pixels, so the same board
// collapses to one column on a phone without a second layout. On a narrow screen
// every widget is full width — a two-column board on a 380px screen is two
// unreadable columns, not a compact one.
//
// BOARDS ARE PLURAL, AND THEY ARE THE OPERATOR'S. Sales wants the pipeline;
// support wants response times; the owner wants four numbers and nothing else.
// One board cannot be all three, so the board menu below is the surface for the
// whole set — switch, add, rename, choose which one opens first, delete. It
// exists because the surface once created exactly one board, named it "How we
// are doing" on the tenant's behalf, and then offered no way to rename it, make
// a second one or remove it; the API had supported all of that from the start.

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, ChevronDown, LayoutDashboard, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useConfirm } from '../../lib/confirm';
import {
  useArchiveDashboard,
  useCreateDashboard,
  useDashboards,
  useDashboard,
  useLandingDashboard,
  useReports,
  useSetWidgets,
  useUpdateDashboard,
  type Dashboard,
  type DashboardWidget,
} from './report-builder-data';
import { ReportWidget } from './report-widget';

/**
 * Column span → a Tailwind class. Quantised rather than computed, because a
 * class assembled at runtime is not in the stylesheet Tailwind generated.
 *
 * CONTAINER queries, not viewport ones. A pane is dragged to whatever width its
 * operator wants, so `lg:` — which asks how wide the BROWSER is — put two
 * half-width widgets side by side in a 400px pane on a 2560px monitor, and left
 * a board stacked in a full-screen pane on a laptop. `PANE_SHELL` declares
 * `@container` for exactly this; every other workbench surface measures against
 * the pane, and now so does this one.
 */
const SPAN: Record<number, string> = {
  1: '@3xl:col-span-1',
  2: '@3xl:col-span-2',
  3: '@3xl:col-span-3',
  4: '@3xl:col-span-4',
  5: '@3xl:col-span-5',
  6: '@3xl:col-span-6',
  7: '@3xl:col-span-7',
  8: '@3xl:col-span-8',
  9: '@3xl:col-span-9',
  10: '@3xl:col-span-10',
  11: '@3xl:col-span-11',
  12: '@3xl:col-span-12',
};

/** What the board dialog is editing. `null` when it is closed. */
interface BoardDraft {
  mode: 'new' | 'edit';
  name: string;
  description: string;
  isDefault: boolean;
  shared: boolean;
}

/** What the widget dialog is doing. Adding picks a report and may name it;
 *  renaming only ever changes the name, because moving a widget to a different
 *  report is removing one and adding another. */
type WidgetDraft =
  | { mode: 'add'; reportId: string; title: string }
  | { mode: 'rename'; widgetId: string; title: string };

export function DashboardsSurface({ ctx }: { ctx: SurfaceContext }) {
  const paramId = typeof ctx.params.id === 'string' ? ctx.params.id : null;
  const landing = useLandingDashboard();
  const { data: boards, isFetching, refetch } = useDashboards();
  const toast = useToast();
  const confirm = useConfirm();

  const { data: reports } = useReports();

  // Which board is open: the one addressed, else the tenant's landing board.
  const [activeId, setActiveId] = useState<string | null>(paramId);
  const boardIds = useMemo(() => boards?.items ?? [], [boards]);
  useEffect(() => {
    const target = landing.data;
    if (activeId || !target) return;
    // Only adopt the landing board while it is still in the list. Deleting the
    // last board clears `activeId`, and the two queries settle at their own
    // pace — without this check the stale landing answer would put the deleted
    // board's id straight back, and the pane would sit on a 404 instead of
    // offering to make a new one.
    if (boardIds.length === 0 || boardIds.some((b) => b.id === target.id)) {
      setActiveId(target.id);
    }
  }, [activeId, landing.data, boardIds]);

  const { data: board } = useDashboard(activeId ?? 'new');
  const setWidgets = useSetWidgets(activeId ?? 'new');
  const createDashboard = useCreateDashboard();
  const updateDashboard = useUpdateDashboard(activeId ?? 'new');
  const archiveDashboard = useArchiveDashboard();

  const [boardDraft, setBoardDraft] = useState<BoardDraft | null>(null);
  const [widgetDraft, setWidgetDraft] = useState<WidgetDraft | null>(null);

  useEffect(() => {
    ctx.setTitle(board?.name ?? 'Dashboards');
  }, [ctx, board]);

  const all = boardIds;
  const widgets = board?.widgets ?? [];

  /* ── Widgets ────────────────────────────────────────────────────────────── */

  function placement(list: DashboardWidget[]): Omit<DashboardWidget, 'id' | 'report'>[] {
    return list.map((w) => ({
      reportId: w.reportId,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      title: w.title,
    }));
  }

  async function addWidget(reportId: string, title: string): Promise<void> {
    // Appended below everything, half width — a new widget should never land on
    // top of something somebody arranged.
    const nextY = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    await setWidgets.mutateAsync([
      ...placement(widgets),
      { reportId, x: 0, y: nextY, w: 6, h: 4, title: title.trim() === '' ? null : title.trim() },
    ]);
    setWidgetDraft(null);
  }

  async function renameWidget(widgetId: string, title: string): Promise<void> {
    const next = title.trim() === '' ? null : title.trim();
    await setWidgets.mutateAsync(
      placement(widgets.map((w) => (w.id === widgetId ? { ...w, title: next } : w)))
    );
    setWidgetDraft(null);
  }

  async function removeWidget(widgetId: string): Promise<void> {
    await setWidgets.mutateAsync(placement(widgets.filter((w) => w.id !== widgetId)));
  }

  async function resizeWidget(widgetId: string, w: number): Promise<void> {
    await setWidgets.mutateAsync(
      placement(widgets.map((widget) => (widget.id === widgetId ? { ...widget, w } : widget)))
    );
  }

  /* ── Boards ─────────────────────────────────────────────────────────────── */

  function startNewBoard(): void {
    setBoardDraft({
      mode: 'new',
      // Suggested for the first one, blank after that. A second board is being
      // made BECAUSE it is for something in particular, so offering a name for
      // it would only be something to delete.
      name: all.length === 0 ? 'How we are doing' : '',
      description: '',
      // The first board is what everyone lands on; a later one only takes that
      // over if its author says so.
      isDefault: all.length === 0,
      shared: true,
    });
  }

  function startEditBoard(): void {
    if (!board) return;
    setBoardDraft({
      mode: 'edit',
      name: board.name,
      description: board.description ?? '',
      isDefault: board.isDefault,
      shared: board.shared,
    });
  }

  async function saveBoard(draft: BoardDraft): Promise<void> {
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      isDefault: draft.isDefault,
      shared: draft.shared,
    };
    if (draft.mode === 'new') {
      const created = await createDashboard.mutateAsync(input);
      setActiveId(created.id);
      setBoardDraft(null);
      toast.add({ title: `“${created.name}” created — add a report to it.`, type: 'success' });
      return;
    }
    const saved = await updateDashboard.mutateAsync(input);
    setBoardDraft(null);
    toast.add({ title: `“${saved.name}” saved`, type: 'success' });
  }

  async function deleteBoard(target: Dashboard): Promise<void> {
    const count = target.id === activeId ? widgets.length : 0;
    const ok = await confirm({
      title: `Delete “${target.name}”?`,
      description:
        count > 0
          ? `The ${String(count)} report${count === 1 ? '' : 's'} on it stay exactly as they are — this only removes the board they were arranged on.`
          : 'The reports it points at stay exactly as they are — this only removes the board.',
      confirmLabel: 'Delete this board',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    await archiveDashboard.mutateAsync(target.id);
    // Land on whatever is left rather than an empty pane; null when it was the
    // last one, which puts the "no dashboard yet" invitation back.
    setActiveId(all.find((b) => b.id !== target.id)?.id ?? null);
    toast.add({ title: `“${target.name}” deleted`, type: 'success' });
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (landing.isPending) {
    return (
      <div className={PANE_SHELL}>
        <div className="skeleton m-6 h-64" />
      </div>
    );
  }

  const boardDialog = (
    <PaneScope>
      <Dialog
        open={boardDraft !== null}
        onOpenChange={(next) => {
          if (!next) setBoardDraft(null);
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
          <DialogTitle>{boardDraft?.mode === 'new' ? 'A new board' : 'This board'}</DialogTitle>
          {boardDraft ? (
            <>
              <form
                id="crm-board-form"
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (boardDraft.name.trim() !== '') void saveBoard(boardDraft);
                }}
              >
                <Field>
                  <FieldLabel>What to call it</FieldLabel>
                  <Input
                    color="module"
                    value={boardDraft.name}
                    placeholder="Sales this month"
                    onChange={(event) => {
                      setBoardDraft({ ...boardDraft, name: event.target.value });
                    }}
                  />
                  <FieldDescription>
                    Name it after the question it answers — that is what you will be looking for
                    when there are four of these.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>What it is for</FieldLabel>
                  <Textarea
                    color="module"
                    rows={2}
                    value={boardDraft.description}
                    placeholder="The numbers we go through every Monday."
                    onChange={(event) => {
                      setBoardDraft({ ...boardDraft, description: event.target.value });
                    }}
                  />
                  <FieldDescription>Optional.</FieldDescription>
                </Field>

                <Field>
                  <div className="flex items-start gap-3">
                    <Switch
                      color="module"
                      aria-label="Open this board first"
                      checked={boardDraft.isDefault}
                      onCheckedChange={(checked) => {
                        setBoardDraft({ ...boardDraft, isDefault: checked === true });
                      }}
                    />
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Open this board first</FieldLabel>
                      <FieldDescription>
                        The one Dashboards opens on. Turning it on here turns it off wherever it
                        was.
                      </FieldDescription>
                    </div>
                  </div>
                </Field>

                <Field>
                  <div className="flex items-start gap-3">
                    <Switch
                      color="module"
                      aria-label="Share it with your team"
                      checked={boardDraft.shared}
                      onCheckedChange={(checked) => {
                        setBoardDraft({ ...boardDraft, shared: checked === true });
                      }}
                    />
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Share it with your team</FieldLabel>
                      <FieldDescription>
                        Everyone can open it. Off keeps it to you.
                      </FieldDescription>
                    </div>
                  </div>
                </Field>
              </form>

              <DialogFooter>
                <Button
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBoardDraft(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="crm-board-form"
                  color="module"
                  size="sm"
                  loading={createDashboard.isPending || updateDashboard.isPending}
                  disabled={boardDraft.name.trim() === ''}
                >
                  {boardDraft.mode === 'new' ? 'Create it' : 'Save'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PaneScope>
  );

  if (!landing.data && !activeId) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<LayoutDashboard className="size-6" aria-hidden />}
            title="No dashboard yet"
            description="A dashboard puts the reports you check often on one screen, kept up to date automatically."
            actions={
              <Button color="module" onClick={startNewBoard}>
                Create one
              </Button>
            }
          />
        </div>
        {boardDialog}
      </div>
    );
  }

  const renaming = widgetDraft?.mode === 'rename' ? widgetDraft : null;
  const adding = widgetDraft?.mode === 'add' ? widgetDraft : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Dashboard controls"
        controls={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button color="module" variant="soft" size="sm" className="min-w-0 gap-1.5">
                  <LayoutDashboard className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{board?.name ?? 'Dashboards'}</span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Boards</DropdownMenuLabel>
                  {all.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => {
                        setActiveId(option.id);
                      }}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        {option.isDefault ? (
                          <Star className="size-3.5 shrink-0" aria-label="Opens first" />
                        ) : null}
                        {option.id === activeId ? (
                          <Check className="size-4 shrink-0" aria-hidden />
                        ) : null}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={startNewBoard}>
                    <span className="flex w-full items-center gap-2">
                      <Plus className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1">Another board</span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={startEditBoard}>
                    <span className="flex w-full items-center gap-2">
                      <Pencil className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1">Rename or share this one</span>
                    </span>
                  </DropdownMenuItem>
                  {board ? (
                    <DropdownMenuItem
                      onClick={() => {
                        void deleteBoard(board);
                      }}
                    >
                      <span className="flex w-full items-center gap-2">
                        <Trash2 className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1">Delete “{board.name}”</span>
                      </span>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {board?.description ? (
              <Text className="hidden min-w-0 truncate md:block">{board.description}</Text>
            ) : null}
          </>
        }
        refresh={
          <div className="ml-auto flex items-center gap-2">
            <Button
              color="module"
              onClick={() => {
                setWidgetDraft({ mode: 'add', reportId: '', title: '' });
              }}
            >
              <Plus className="size-4" aria-hidden /> Add a report
            </Button>
            <RefreshButton isFetching={isFetching} onRefresh={() => void refetch()} />
          </div>
        }
      />

      <div className="overflow-auto p-6">
        {widgets.length === 0 ? (
          <EmptyState
            icon={<LayoutDashboard className="size-6" aria-hidden />}
            title="Nothing on this board yet"
            description="Add a report and it will appear here, running live every time you open it."
            actions={
              <Button
                color="module"
                onClick={() => {
                  setWidgetDraft({ mode: 'add', reportId: '', title: '' });
                }}
              >
                Add a report
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-12">
            {widgets.map((widget) => (
              <div key={widget.id} className={SPAN[widget.w] ?? '@3xl:col-span-6'}>
                <ReportWidget
                  widget={widget}
                  onOpen={() =>
                    ctx.open('crm.report.builder', { id: widget.reportId }, { target: 'tab' })
                  }
                  onRename={() => {
                    setWidgetDraft({
                      mode: 'rename',
                      widgetId: widget.id,
                      title: widget.title ?? '',
                    });
                  }}
                  onRemove={() => void removeWidget(widget.id)}
                  onResize={(w) => void resizeWidget(widget.id, w)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {boardDialog}

      <PaneScope>
        <Dialog
          open={widgetDraft !== null}
          onOpenChange={(next) => {
            if (!next) setWidgetDraft(null);
          }}
        >
          <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
            <DialogTitle>
              {renaming ? 'What this one is called' : 'Add a report to this board'}
            </DialogTitle>

            {adding ? (
              <form
                id="crm-widget-form"
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (adding.reportId !== '') void addWidget(adding.reportId, adding.title);
                }}
              >
                <Field>
                  <FieldLabel>Which report</FieldLabel>
                  {/* No picker at all when there is nothing to pick. An empty
                      Select renders as an invalid field, which blames the
                      person for a state they did not cause. */}
                  {(reports?.items.length ?? 0) === 0 ? (
                    <FieldDescription>
                      There are no reports yet. Build one under “Build a report” — or open one of
                      the ready-made ones there, copy it, and change a thing.
                    </FieldDescription>
                  ) : (
                    <Select
                      color="module"
                      aria-label="Which report"
                      value={adding.reportId}
                      items={Object.fromEntries((reports?.items ?? []).map((r) => [r.id, r.name]))}
                      onValueChange={(next) => {
                        setWidgetDraft({ ...adding, reportId: next as string });
                      }}
                    />
                  )}
                </Field>

                <Field>
                  <FieldLabel>Call it something else here</FieldLabel>
                  <Input
                    color="module"
                    value={adding.title}
                    placeholder="Leave empty to use the report's own name"
                    onChange={(event) => {
                      setWidgetDraft({ ...adding, title: event.target.value });
                    }}
                  />
                  <FieldDescription>
                    Only changes the heading on this board. The report keeps its name everywhere
                    else.
                  </FieldDescription>
                </Field>
              </form>
            ) : renaming ? (
              <form
                id="crm-widget-form"
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void renameWidget(renaming.widgetId, renaming.title);
                }}
              >
                <Field>
                  <FieldLabel>The heading on this board</FieldLabel>
                  <Input
                    color="module"
                    value={renaming.title}
                    placeholder="Leave empty to use the report's own name"
                    onChange={(event) => {
                      setWidgetDraft({ ...renaming, title: event.target.value });
                    }}
                  />
                  <FieldDescription>
                    The report itself is untouched — this is what the card is called here.
                  </FieldDescription>
                </Field>
              </form>
            ) : null}

            <DialogFooter>
              <Button
                color="neutral"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setWidgetDraft(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="crm-widget-form"
                color="module"
                size="sm"
                loading={setWidgets.isPending}
                disabled={adding !== null && adding.reportId === ''}
              >
                {renaming ? 'Save' : 'Add it'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PaneScope>
    </div>
  );
}
