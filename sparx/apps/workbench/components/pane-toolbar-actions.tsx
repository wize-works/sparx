'use client';

// A toolbar's secondary actions, declared as VALUES — the same move as
// pane-toolbar-filters.tsx, for the same reason.
//
// A detail pane's bar is not a list's bar. It has no filters and nothing to
// refresh; what it has is one PRIMARY action (Save) and a couple of things you
// can also do from here (start a deal, start a task). Those were being written
// as icon buttons with `hidden @md:inline` labels, which on a phone leaves two
// bare `+` glyphs side by side — two different actions rendered identically,
// with nothing on screen to tell them apart.
//
// The label is not optional here and not a tooltip. It is the action's name, and
// the bar decides how much of it there is room to show:
//
//   wide      icon + label.
//   narrow    icon only in the bar is NOT an option — that is the bug. They move
//             into the popover and wear their labels there, as rows.
//
// Which also draws the line `primary` was blurring: exactly one action is what
// the surface exists to do. Everything else it OFFERS is an action, and actions
// are allowed to move.

import type { ReactNode } from 'react';
import { Button, Tooltip } from '@wizeworks/silicaui-react';
import type { LucideIcon } from 'lucide-react';
import { MENU_ROW } from './toolbar-presentation';
import { ModuleScope, type WorkbenchModule } from './module-scope';

export interface ToolbarAction {
  /** The action's name — accessible name always, visible when there is room. */
  label: string;
  icon: LucideIcon;
  /**
   * Receives the click event, structurally typed.
   *
   * Not `() => void`: every list in the app honours the same modifier contract —
   * Shift opens alongside, Alt opens a new window — via `targetFor(event)`.
   * Narrowing the signature here would silently drop that on 36 surfaces.
   */
  onClick?: (event: { shiftKey: boolean; altKey: boolean }) => void;
  /** Renders as a link opening in a new tab. Use instead of `onClick`. */
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Hover text. Defaults to `label`; set it when the action needs the longer form. */
  title?: string;
  /**
   * Wear ANOTHER module's hue.
   *
   * Color follows functionality, not the page: a "write a social post" action
   * on a commerce surface is Social's, and says so. Without this the action
   * would have to stay bespoke JSX in `controls` purely to keep its provider —
   * and bespoke JSX is what looks foreign in the popover.
   */
  module?: WorkbenchModule;
}

/** Wraps in a nested provider only when the action belongs to another module. */
function Hue({ module, children }: { module?: WorkbenchModule; children: ReactNode }) {
  if (!module) return <>{children}</>;
  return <ModuleScope module={module}>{children}</ModuleScope>;
}

/** Icon + label in the bar. */
export function ToolbarActionButtons({ actions }: { actions: readonly ToolbarAction[] }) {
  return (
    <>
      {actions.map((action) => (
        // `module`, because an action that belongs to an app wears that app's
        // hue (RULE #4). Ghost so it never competes with the primary beside it.
        <Hue key={action.label} module={action.module}>
          <Tooltip content={action.label}>
            <Button
              size="sm"
              variant="ghost"
              color="module"
              className="shrink-0"
              aria-label={action.label}
              disabled={action.disabled}
              loading={action.loading}
              {...(action.href
                ? {
                    // Children arrive via `render`, which the rule cannot see.
                    // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
                    render: <a href={action.href} target="_blank" rel="noreferrer" />,
                  }
                : { onClick: action.onClick })}
            >
              <action.icon className="size-4" aria-hidden />
              <span className="hidden @2xl:inline">{action.label}</span>
            </Button>
          </Tooltip>
        </Hue>
      ))}
    </>
  );
}

/** Full-width labelled rows in the overflow popover. */
export function ToolbarActionRows({ actions }: { actions: readonly ToolbarAction[] }) {
  return (
    <>
      {actions.map((action) => (
        <Hue key={action.label} module={action.module}>
          <Button
            size="sm"
            variant="ghost"
            color="module"
            className={MENU_ROW}
            disabled={action.disabled}
            loading={action.loading}
            {...(action.href
              ? {
                  // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
                  render: <a href={action.href} target="_blank" rel="noreferrer" />,
                }
              : { onClick: action.onClick })}
          >
            <action.icon className="size-4" aria-hidden />
            <span>{action.label}</span>
          </Button>
        </Hue>
      ))}
    </>
  );
}

/**
 * The primary action, when it is a simple icon + label.
 *
 * Filled and colored, because it is the thing the surface exists for — never
 * ghost like the secondaries beside it.
 *
 * ── WHY THIS SLOT EXISTS RATHER THAN A CLASS AT THE CALL SITE ──────────────
 *
 * Whether a primary sheds its label on a narrow bar was being decided by a
 * hand-written `hidden @2xl:inline` at each call site, and the call sites did not
 * agree: 46 collapsed, 102 did not, so "+ Add a customer" sat at full width
 * beside a "+" on the next pane.
 *
 * The rule is not "collapse on mobile". It is: THE LABEL MAY HIDE ONLY WHEN THE
 * ICON CAN CARRY IT ALONE. In a pane already titled "Customers", `+` is
 * unambiguous — the title supplies the noun. A floppy disk is not: 29 primaries
 * are a Save, and a Save reduced to a glyph is the one action nobody may be made
 * to hunt for.
 *
 * So the SLOT is the declaration. `primaryAction` means "an icon that speaks for
 * itself" and the bar compacts it; `primary` takes a node and the bar leaves it
 * exactly as written. One decision, not a hundred and forty-eight.
 */
export function ToolbarPrimaryAction({
  action,
  compact,
}: {
  action: ToolbarAction;
  compact: boolean;
}) {
  return (
    <Hue module={action.module}>
      <Button
        size="sm"
        color="module"
        className="shrink-0 whitespace-nowrap"
        aria-label={action.label}
        title={action.title ?? action.label}
        disabled={action.disabled}
        loading={action.loading}
        {...(action.href
          ? {
              // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
              render: <a href={action.href} target="_blank" rel="noreferrer" />,
            }
          : { onClick: action.onClick })}
      >
        <action.icon className="size-4" aria-hidden />
        {compact ? null : <span>{action.label}</span>}
      </Button>
    </Hue>
  );
}
