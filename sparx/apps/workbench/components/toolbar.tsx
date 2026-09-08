'use client';

// The top toolbar — identity on the left, person on the right.
//
// The left half answers "where am I operating": the brand mark, the workspace
// (tenant), and the SITE — the one control that changes what every pane means.
// Sites are workspaces here (see lib/api/shell-data.ts switchSite), so the
// switcher is deliberately prominent rather than buried in a settings page.
//
// There is intentionally NO breadcrumb. A breadcrumb narrates a single
// location, and a workbench is in several at once — the pane tabs are the
// orientation. What earns a place up here is only what applies to the whole
// window: search, quick add, the focused pane's star, feedback, theme, the
// person.
//
// Each control owns its own file under components/toolbar/; this states the
// shape of the bar and nothing else.

import { useSyncExternalStore } from 'react';
import {
  Button,
  Kbd,
  Navbar,
  NavbarCenter,
  NavbarEnd,
  NavbarStart,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { Copy, LayoutGrid, Search, Star } from 'lucide-react';
import { Wordmark } from '@sparx/brand/react';
import { useFavorites, useTenant, useToggleFavorite } from '../lib/api/shell-data';
import type { WindowMode } from '../lib/window-mode';
import type { ThemeChoice } from '../lib/theme';
import { useWorkbench } from '../lib/workbench/context';
import { AppearanceMenu } from './appearance-menu';
import { FeedbackButton } from './feedback/button';
import { NotificationCenter } from './notification-center';
import { TrialChip } from './billing/trial-chip';
import { QuickAdd } from './toolbar/quick-add';
import { SiteSwitcher } from './toolbar/site-switcher';
import { ViewerMenu } from './toolbar/viewer-menu';

interface ToolbarProps {
  userName: string;
  userEmail: string;
  /** The APPEARANCE the person picked, which is not the same as the one on
   *  screen: `system` is a choice, and it resolves to one of the other two. The
   *  control shows both — the tick marks the choice, the glyph shows what it
   *  currently means. */
  themeChoice: ThemeChoice;
  /** Canonical layout key for the current site — see workbench-shell boot. */
  siteKey: string;
  onSetTheme: (choice: ThemeChoice) => void;
  onOpenLauncher: () => void;
  /** Windows or tabs. Null while the stored preference is still being read, in
   *  which case the control is not offered rather than guessed at. */
  windowMode: WindowMode | null;
  onChangeWindowMode: (mode: WindowMode) => void;
}

/**
 * Windows or tabs, as one pressed button rather than a pair.
 *
 * It sits beside the appearance menu because it is the same kind of thing: a
 * decision about the WORKSPACE, not an action on anything in it. Colorless, like
 * the chrome around it — a bare `.btn` resolves to base-content, and this
 * control has no state worth a hue beyond the pressed one.
 */
function WindowModeToggle({
  windowMode,
  onChangeWindowMode,
}: {
  windowMode: WindowMode;
  onChangeWindowMode: (mode: WindowMode) => void;
}) {
  const toTabs = windowMode === 'windows';
  return (
    <Tooltip
      content={
        toTabs
          ? 'Tidy everything back into a grid'
          : 'Show each thing in its own window you can move around'
      }
    >
      <Button
        variant="ghost"
        shape="square"
        aria-label={toTabs ? 'Switch to a tidy grid' : 'Switch to movable windows'}
        aria-pressed={windowMode === 'windows'}
        onClick={() => {
          onChangeWindowMode(toTabs ? 'tabs' : 'windows');
        }}
      >
        {toTabs ? (
          <LayoutGrid className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </Button>
    </Tooltip>
  );
}

export function Toolbar({
  userName,
  userEmail,
  themeChoice,
  siteKey,
  onSetTheme,
  onOpenLauncher,
  windowMode,
  onChangeWindowMode,
}: ToolbarProps) {
  const { controller } = useWorkbench();
  const { data: tenant } = useTenant();

  // The focused pane, live — the star and feedback context follow it.
  const activeDescriptor = useSyncExternalStore(
    controller.subscribe,
    () => controller.getActiveDescriptor(),
    () => null
  );

  return (
    <Navbar className="border-base-300 bg-base-100 min-h-0 shrink-0 gap-2 border-b py-1.5 pr-3 pl-0">
      <NavbarStart className="gap-1">
        {/* The mark owns the same 48px column as the collapsed rail below and
            centers on the SAME axis as its icons (x=24). Deliberately pinned to
            the COLLAPSED width: expanding the rail must not slide the brand
            mark sideways — it anchors the window, it isn't part of the rail. */}
        <span className="flex shrink-0 justify-center">
          <Wordmark className="mx-2" size={38} aria-label="sparx" />
        </span>

        {/* Workspace — plain identity, not a control. The tenant is a fact of
            the session; there is nothing to switch it to from here. */}
        <span
          data-tour="workspace"
          className="max-w-40 truncate text-sm font-medium"
          title={tenant?.name}
        >
          {tenant?.name ?? ' '}
        </span>

        <SiteSwitcher siteKey={siteKey} />
      </NavbarStart>

      <NavbarCenter className="min-w-0">
        {/* The launcher's visible front door. ⌘K works everywhere; this is for
            the person who hasn't learned that yet.

            A ghost Button, with LAYOUT utilities only (width, alignment, gap).
            Never a text-color override: the variant owns its states — outline
            swaps to the fill's content color on hover, and pinning the text
            breaks that contract into same-on-same. */}
        <span data-tour="search" className="inline-flex w-72 max-w-full">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm"
            onClick={onOpenLauncher}
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="flex-1 truncate text-left">Search everything</span>
            <Kbd size="sm">⌘K</Kbd>
          </Button>
        </span>
      </NavbarCenter>

      <NavbarEnd className="gap-1">
        <TrialChip />

        <span data-tour="quick-add" className="inline-flex">
          <QuickAdd />
        </span>

        <span data-tour="favorite-star" className="inline-flex">
          <StarButton
            surfaceKey={activeDescriptor?.surface ?? null}
            hasParams={Boolean(
              activeDescriptor?.params && Object.keys(activeDescriptor.params).length > 0
            )}
          />
        </span>

        <NotificationCenter />

        <span data-tour="feedback" className="inline-flex">
          <FeedbackButton />
        </span>

        {windowMode ? (
          <WindowModeToggle windowMode={windowMode} onChangeWindowMode={onChangeWindowMode} />
        ) : null}

        <AppearanceMenu choice={themeChoice} onSetTheme={onSetTheme} />

        <span data-tour="account-menu" className="inline-flex">
          <ViewerMenu userName={userName} userEmail={userEmail} />
        </span>
      </NavbarEnd>
    </Navbar>
  );
}

/**
 * Stars the focused SCREEN. Favorites are surface keys — "Invoices", "New
 * invoice" — shared with the dashboard's favorites spine, so an entity pane
 * (one particular invoice) can't be starred; its surface can.
 */
function StarButton({ surfaceKey, hasParams }: { surfaceKey: string | null; hasParams: boolean }) {
  const { data: favorites } = useFavorites();
  const toggle = useToggleFavorite();

  const starrable = Boolean(surfaceKey) && !hasParams;
  const favorited = Boolean(
    surfaceKey && favorites?.some((favorite) => favorite.actionId === surfaceKey)
  );

  const tooltip = !surfaceKey
    ? 'Focus a pane to star it'
    : hasParams
      ? 'Individual records can’t be starred — star their screen instead'
      : favorited
        ? 'Remove from favorites'
        : 'Add to favorites — shows at the top of search';

  return (
    <Tooltip content={tooltip}>
      {/* The disabled state keeps the tooltip by staying focusable-adjacent:
          silica Buttons drop pointer events when disabled, so wrap in a span. */}
      <span className="inline-flex">
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          disabled={!starrable || toggle.isPending}
          aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorited}
          onClick={() => {
            if (surfaceKey) toggle.mutate({ actionId: surfaceKey, favorited });
          }}
        >
          <Star className={favorited ? 'text-warning size-4 fill-current' : 'size-4'} aria-hidden />
        </Button>
      </span>
    </Tooltip>
  );
}
