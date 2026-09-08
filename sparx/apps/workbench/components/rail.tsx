'use client';

// The rail — the workbench's primary navigation.
//
// Modules live here as icons, always visible, so the app is browsable by
// someone who has never used it and doesn't know what anything is called.
// (An earlier version of this app was ⌘K-only. That is a power-user pattern
// dressed up as minimalism: it assumes you already know the name of the thing
// you're looking for, which for a business owner opening sparx for the first
// time is exactly the assumption that fails.)
//
// Only the tenant's ENABLED modules appear. Modules are feature flags, never
// tiers: a module that is off runs no workers and stores no rows, so showing
// its icon would be advertising a door that opens onto a 404. Until the
// activation states arrive, every module with surfaces shows — a briefly
// too-generous rail beats navigation that pops in group by group.
//
// Selecting a module BROWSES it — see components/module-panel.tsx. It never
// changes what's open, because in a workbench there is no single "current"
// module to switch away from.
//
// The rail is ONLY modules (+ workspaces). Brand, search, theme, and the
// account all live in the top toolbar now — one home each, and the rail reads
// as what it is: the module strip.
//
// Built from silicaui's <Sidebar>, using its REAL collapse mechanism: a
// SidebarProvider (owned by the shell, so the state persists) drives
// `[data-collapsed]`, the footer's collapse row toggles it through
// `useSidebar()`, and the width animates between `--sidebar-w` and
// `--sidebar-w-collapsed`. Collapsed it is an icon rail;
// expanded it names every module for someone who doesn't yet recognise the
// glyphs. Item sizing, hover, active accent, and focus rings all come from the
// library. An earlier version hand-rolled these as raw <button>s with their own
// hover/active classes, which is exactly the re-skinning the design rules ban.
//
// Density is deliberate: silica's stock collapsed rail is 4.5rem, which around a
// 1.25rem glyph is mostly empty gutter. `--sidebar-w-collapsed` is the
// component's documented knob for exactly this, set here through a Tailwind
// arbitrary-property utility (never an inline style), and the content padding
// tightens with it so the icons sit in a column rather than a corridor.

import { useEffect, useState } from 'react';
import { LayoutGrid, PanelLeftIcon, Trash2, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarItem,
  Tooltip,
  useSidebar,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../lib/confirm';
import { ModuleScope, type WorkbenchModule } from './module-scope';
import { afterMenuClose, deferTick } from '../lib/defer';
import {
  useClearRecents,
  useFavorites,
  useRecents,
  useToggleFavorite,
} from '../lib/api/shell-data';
import { getSurface, resolveTitle, type SurfaceDefinition } from '../lib/surfaces/registry';
import {
  moduleIsVisible,
  useKnownModules,
  useReachableModules,
  useVisibleNav,
} from '../lib/surfaces/use-visible-nav';
import { useWorkbench } from '../lib/workbench/context';
import {
  clearLayout,
  deleteWorkspace,
  listWorkspaces,
  saveLayout,
  saveWorkspace,
  type NamedWorkspace,
} from '../lib/workbench/persistence';
import { readWindowMode, writeWindowMode } from '../lib/window-mode';
import { coerceZoom, readZoom, writeZoom } from '../lib/window-zoom';

interface RailProps {
  /** Module currently being browsed, or null when the panel is closed. */
  browsing: WorkbenchModule | null;
  /** Storage key for the active site — workspace saves flow through it. */
  siteKey: string;
  /** Labels showing beside the icons. Owned by the shell so it persists. */
  expanded: boolean;
  onBrowse: (module: WorkbenchModule) => void;
}

export function Rail({ browsing, siteKey, expanded, onBrowse }: RailProps) {
  const { controller } = useWorkbench();
  const confirm = useConfirm();
  const toast = useToast();
  // The shell's SidebarProvider, reached the same way SidebarTrigger reaches
  // it. Null outside a provider, which is why the call below is optional.
  const sidebar = useSidebar();
  // Shared with the mobile drawer — the two presentations must never disagree
  // about which modules exist, and they would the moment the gating rule was
  // written down twice.
  const visibleNav = useVisibleNav();

  // ── Favorites + recents ──────────────────────────────────────────────────
  // Both ride the shared /v1/me spine (the same table the dashboard uses) with
  // surface keys as actionIds. The rail renders only the ids that name a
  // surface THIS operator can reach: dashboard-only ids, unlisted child
  // surfaces, and surfaces whose module is off or restricted all resolve to
  // null and drop out — the same gate the module list and launcher use.
  const { data: favorites } = useFavorites();
  const { data: recents } = useRecents();
  const toggleFavorite = useToggleFavorite();
  const clearRecents = useClearRecents();
  const reachable = useReachableModules();
  const known = useKnownModules();

  const resolveVisible = (actionId: string): SurfaceDefinition | null => {
    const definition = getSurface(actionId);
    if (!definition || definition.listed === false) return null;
    if (!moduleIsVisible(definition.module, reachable, known)) return null;
    return definition;
  };

  const favoriteSurfaces = (favorites ?? [])
    .map((favorite) => resolveVisible(favorite.actionId))
    .filter((definition): definition is SurfaceDefinition => definition !== null);

  // A favorited surface is already pinned above; showing it again under Recent
  // is noise, so recents exclude anything already starred.
  const favoriteKeys = new Set(favoriteSurfaces.map((definition) => definition.key));
  const recentSurfaces = (recents ?? [])
    .map((recent) => resolveVisible(recent.actionId))
    .filter(
      (definition): definition is SurfaceDefinition =>
        definition !== null && !favoriteKeys.has(definition.key)
    );

  // A tab open in the focused group — the same destination the launcher's Enter
  // and the module panel's row click use. The rail is a launch shortcut, not a
  // second place surfaces live, so it opens exactly where they'd expect.
  const openSurface = (definition: SurfaceDefinition) => {
    controller.open(definition.key);
  };

  // Workspaces are STATE, not a render-time localStorage read — a read
  // during render never updates, so a workspace saved a second ago wouldn't
  // appear in the menu until something unrelated re-rendered the rail.
  const [workspaces, setWorkspaces] = useState<NamedWorkspace[]>([]);
  useEffect(() => {
    setWorkspaces(listWorkspaces());
  }, []);
  const [saveOpen, setSaveOpen] = useState(false);

  // Opening a workspace replaces the live arrangement wholesale, so it goes
  // through the same door as a site switch: confirm unsaved work, write the
  // saved arrangement as the site's current layout, restart the window.
  const restoreWorkspace = async (workspace: NamedWorkspace) => {
    // Let the menu finish closing before any dialog opens — see lib/defer.ts.
    await deferTick();
    if (controller.hasUnsavedWork()) {
      const ok = await confirm({
        title: `Open "${workspace.name}" over unsaved changes?`,
        description:
          'Something here has edits that were never saved. Opening a workspace reloads the workbench and those edits are gone.',
        confirmLabel: 'Open it',
        cancelLabel: 'Stay here',
        color: 'danger',
      });
      if (!ok) return;
    }
    // Put the presentation back BEFORE the reload, so the dock boots straight
    // into the one this arrangement was captured in rather than tiling it and
    // then re-floating a beat later.
    const restoredZoom = workspace.zoom === undefined ? null : coerceZoom(workspace.zoom);
    if (restoredZoom) writeZoom(restoredZoom);
    if (workspace.mode === 'windows' || workspace.mode === 'tabs') {
      writeWindowMode(workspace.mode);
    }
    saveLayout(siteKey, workspace.grid, workspace.panes);
    window.location.reload();
  };

  const removeWorkspace = async (workspace: NamedWorkspace) => {
    await deferTick();
    const ok = await confirm({
      title: `Delete the "${workspace.name}" workspace?`,
      description:
        'Only the saved arrangement is deleted — nothing that was open in it is touched. There is no undo.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    deleteWorkspace(workspace.id);
    setWorkspaces(listWorkspaces());
  };

  const resetToEmpty = async () => {
    await deferTick();
    const ok = await confirm({
      title: 'Close every panel and start empty?',
      description: controller.hasUnsavedWork()
        ? 'Something here has unsaved edits — starting empty discards them. There is no undo.'
        : 'Every open panel closes and the workbench reloads empty. Your saved workspaces are not affected.',
      confirmLabel: 'Start empty',
      cancelLabel: 'Keep my panels',
      color: 'danger',
    });
    if (!ok) return;
    clearLayout(siteKey);
    window.location.reload();
  };

  return (
    // TWO levels of module scope, and the split is load-bearing:
    //
    //   • This OUTER scope drives the ACTIVE item's accent. `.sidebar-module`
    //     declares its accent on the <aside> itself, and a custom property is
    //     dereferenced where the DECLARATION lives — not where it's used. So a
    //     scope on each item came too late: the aside resolved --color-module
    //     against :root and every active item came out brand ember. Since only
    //     one item is ever active, and it is always the browsed module, scoping
    //     the aside to `browsing` is both correct and sufficient.
    //
    //   • The INNER per-item scopes still drive each ICON's hue, because
    //     `text-module` is used on the icon, inside its own scope.
    <ModuleScope module={browsing ?? 'platform'} className="contents">
      <Sidebar
        color="module"
        aria-label="Modules"
        // 3rem collapsed (silica ships 4.5rem — a corridor around a 20px
        // glyph). Set through the component's own documented CSS variable via a
        // Tailwind arbitrary property; never an inline style.
        className="bg-base-100 shrink-0 rounded-lg [--sidebar-w-collapsed:3rem]"
      >
        {/* Padding tracks the width: the stock 0.75rem would leave a 48px rail
            with 24px of usable row. */}
        <SidebarContent className={expanded ? 'pt-2' : 'px-1.5 pt-2'}>
          <SidebarGroup>
            {visibleNav.map((entry) => (
              <ModuleScope key={entry.module} module={entry.module}>
                <Tooltip content={entry.label} side="right" disabled={expanded}>
                  <SidebarItem
                    // Per-module tour anchor (`module-commerce`, …). The product
                    // tour's Phase-2 steps highlight each enabled tool's rail icon;
                    // this is a stable handle that survives restyles. Only enabled,
                    // visible modules render here, so the tour gates on its presence.
                    data-tour={`module-${entry.module}`}
                    // `text-module` inside this item's own scope is what makes
                    // the rail a color-coded module switcher — Selling orange,
                    // Customers cyan — the same signal the dashboard's rail
                    // carries. Active or not: the hue IS the module's identity,
                    // not a selection state.
                    icon={<entry.icon className="text-module size-5" aria-hidden />}
                    // A collapsed Sidebar hides the label visually AND removes it
                    // from the accessibility tree, so every rail item needs an
                    // explicit name — otherwise the whole primary navigation is
                    // announced as a row of unlabelled buttons.
                    aria-label={entry.label}
                    active={browsing === entry.module}
                    // `aria-current` marks what's being BROWSED. Not aria-pressed:
                    // this is a navigation position, not a toggle.
                    aria-current={browsing === entry.module ? 'true' : undefined}
                    onClick={() => {
                      onBrowse(entry.module);
                    }}
                  >
                    {entry.label}
                  </SidebarItem>
                </Tooltip>
              </ModuleScope>
            ))}
          </SidebarGroup>

          {/* Favorites — the operator's curated shortcuts. Starred from the
              toolbar (the focused pane) or removed here; either way this group
              only appears once something's in it, so an operator who's starred
              nothing never sees an empty heading. */}
          {favoriteSurfaces.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Favorites</SidebarGroupLabel>
              {favoriteSurfaces.map((definition) => (
                <SurfaceRow
                  key={definition.key}
                  definition={definition}
                  expanded={expanded}
                  onOpen={() => {
                    openSurface(definition);
                  }}
                  removeLabel={`Remove ${resolveTitle(definition, {})} from favorites`}
                  onRemove={() => {
                    toggleFavorite.mutate({ actionId: definition.key, favorited: true });
                  }}
                />
              ))}
            </SidebarGroup>
          )}

          {/* Recents — automatic history, newest first. No per-row remove: a
              recent is ephemeral by nature and rolls over on its own; the only
              management it earns is clearing the lot, which rides the label so
              it's out of the launch path. Label (and Clear) hide when the rail
              collapses to icons — collapsed, this is purely for relaunching. */}
          {recentSurfaces.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>
                <span className="flex w-full items-center justify-between gap-2">
                  Recent
                  <Button
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    disabled={clearRecents.isPending}
                    onClick={() => {
                      clearRecents.mutate();
                    }}
                  >
                    Clear
                  </Button>
                </span>
              </SidebarGroupLabel>
              {recentSurfaces.map((definition) => (
                <SurfaceRow
                  key={definition.key}
                  definition={definition}
                  expanded={expanded}
                  onOpen={() => {
                    openSurface(definition);
                  }}
                />
              ))}
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className={expanded ? undefined : 'px-1.5'}>
          <DropdownMenu>
            <Tooltip content="Workspaces" side="right" disabled={expanded}>
              <DropdownMenuTrigger>
                <SidebarItem
                  icon={<LayoutGrid className="size-5" aria-hidden />}
                  aria-label="Workspaces"
                >
                  Workspaces
                </SidebarItem>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent side="right" align="end">
              {/* Base UI requires a label to live inside a Group — a bare
                  DropdownMenuLabel throws MenuGroupRootContext at runtime. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                {workspaces.length === 0 ? (
                  <DropdownMenuItem disabled>No saved workspaces yet</DropdownMenuItem>
                ) : (
                  workspaces.map((workspace) => (
                    <DropdownMenuItem
                      key={workspace.id}
                      onClick={() => {
                        void restoreWorkspace(workspace);
                      }}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                        {/* Delete rides inside the row. stopPropagation keeps
                            the row's restore from firing on the same click. */}
                        <Button
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          shape="square"
                          aria-label={`Delete the ${workspace.name} workspace`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeWorkspace(workspace);
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  afterMenuClose(() => {
                    setSaveOpen(true);
                  });
                }}
              >
                Save this as a workspace…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void resetToEmpty();
                }}
              >
                Close everything and start empty
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* The collapse control is a SidebarItem, NOT a SidebarTrigger.
                        SidebarTrigger is a fixed 2rem square icon button, so a text
                        label inside it has nowhere to go and spills out of the rail.
                        SidebarItem is the row primitive: it lays out icon + label,
                        hides the label itself when collapsed, and carries the same
                        hover/focus treatment as every other row — so this reads as
                        part of the rail instead of a loose control bolted under it.
                        It drives the same SidebarProvider the shell owns (via
                        useSidebar), so the choice still persists. */}
          <Tooltip content="Collapse to icons" side="right" disabled={expanded}>
            <SidebarItem
              icon={<PanelLeftIcon className="size-5" aria-hidden />}
              aria-label={expanded ? 'Collapse the module rail' : 'Expand the module rail'}
              aria-expanded={expanded}
              onClick={() => {
                sidebar?.toggle();
              }}
            >
              Collapse
            </SidebarItem>
          </Tooltip>
        </SidebarFooter>
      </Sidebar>

      {/* Owned by the rail but OUTSIDE the menu — the menu closes when its item
          is clicked; the dialog opens as its own thing, silicaui end to end
          (window.prompt is not a form). */}
      <SaveWorkspaceDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={(name) => {
          // The presentation goes in WITH the boxes. A grid is a set of pixel
          // rectangles measured at whatever zoom was on screen at the time, so
          // replaying a 50% arrangement at 100% brings every window back half
          // size — and replaying a windows arrangement in tabs tiles it.
          saveWorkspace(
            name,
            controller.serializeGrid(),
            { ...controller.snapshotDescriptors() },
            { zoom: readZoom(), mode: readWindowMode() ?? 'tabs' }
          );
          setWorkspaces(listWorkspaces());
          toast.add({
            title: 'Workspace saved',
            description: `"${name}" is under Workspaces whenever you want this arrangement back.`,
            type: 'success',
          });
        }}
      />
    </ModuleScope>
  );
}

/**
 * One favorite or recent row. A launch shortcut, not a navigation position — it
 * never carries an `active` state; clicking opens the surface where any other
 * open would land it. The icon wears the surface's MODULE hue (Selling orange,
 * Customers cyan) via its own scope, so a mixed list of shortcuts stays
 * color-coded to what each one actually opens — the same signal the module
 * strip above carries.
 *
 * The remove control (favorites only) is an absolute SIBLING of the row, not
 * silica's `trailing` slot: SidebarItem renders as a <button> once it has an
 * onClick, and `trailing` lives INSIDE it — a real control there is a
 * button-in-a-button (invalid HTML, hydration error). Overlaid on the row's
 * right edge and revealed on hover, it's a sibling that receives its own click.
 * Only shown expanded — the collapsed icon rail has no room, and is for
 * relaunching, not curating.
 */
function SurfaceRow({
  definition,
  expanded,
  onOpen,
  onRemove,
  removeLabel,
}: {
  definition: SurfaceDefinition;
  expanded: boolean;
  onOpen: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const Icon = definition.icon;
  const title = resolveTitle(definition, {});
  return (
    <ModuleScope module={definition.module}>
      <div className="group relative">
        <Tooltip content={title} side="right" disabled={expanded}>
          <SidebarItem
            icon={<Icon className="text-module size-5" aria-hidden />}
            aria-label={title}
            onClick={onOpen}
          >
            {title}
          </SidebarItem>
        </Tooltip>
        {onRemove && expanded && (
          <Button
            color="neutral"
            variant="ghost"
            size="xs"
            shape="square"
            aria-label={removeLabel}
            // Hover/focus-reveal so a curated list doesn't read as a column of
            // delete buttons. Keyboard reaches it (always in tab order);
            // focus-visible paints it the moment it's focused.
            className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </ModuleScope>
  );
}

function SaveWorkspaceDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setName('');
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogTitle>Save this as a workspace</DialogTitle>
        <DialogDescription>
          Everything open right now — panes, splits, sizes — saved as an arrangement you can come
          back to.
        </DialogDescription>
        <Field className="py-2">
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            value={name}
            placeholder="Month end, Fulfilment, Catalog cleanup…"
            // No autoFocus needed: the dialog's focus trap lands on the first
            // tabbable element, which is this input.
            onChange={(event) => {
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <FieldDescription>Pick the task it sets you up for</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose>
            <Button color="neutral" variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button color="primary" size="sm" disabled={!name.trim()} onClick={submit}>
            Save workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
