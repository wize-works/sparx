'use client';

// Where a scored thing is edited, and the hue that editor wears.
//
// WHY THIS EXISTS. The page check named eight specific things to change and gave
// no way to change any of them. The whole pane had exactly two buttons, Refresh
// and Copy a link — nothing in its body was interactive at all. A clothing maker
// read "a very short title wastes the best chance you have of being found", and
// then had to hold the address `/book` in her head, leave for My Site, find the
// page in a list and open it, from a screen that already knew exactly which page
// it meant (issue 392).
//
// A pane being READ-ONLY does not make it actionless. It already knows the kind
// of thing and its id, which is everything needed to open the one editor that can
// change what the check complained about.
//
// THE HUE IS THE POINT, not decoration. The jump LEAVES this module, so the
// button wears the module it lands in — Builder for a page, CMS for an article,
// Commerce for a product or a collection — and says where it goes before it is
// taken. `ToolbarAction.module` exists for exactly this, so the action stays a
// value and still reads correctly once folded into the narrow-pane popover.

import { useMemo } from 'react';
import { faBox, faFileLines, faFileText, faLayerGroup } from '@fortawesome/pro-solid-svg-icons';
import type { IconGlyph } from '@piggles/ui';
import type { WorkbenchModule } from '../../components/module-scope';
import type { ToolbarAction } from '../../components/pane-toolbar-actions';
import type { SurfaceParams } from '../../lib/surfaces/descriptor';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  moduleIsVisible,
  useKnownModules,
  useReachableModules,
} from '../../lib/surfaces/use-visible-nav';
import { entityLabel, type EntityType } from './data';

export interface FixTarget {
  /** Registry key of the editor that can change what the checks complained about. */
  surface: string;
  params: SurfaceParams;
  /** The module the jump lands in. The button wears its hue. */
  module: WorkbenchModule;
  icon: IconGlyph;
  /** The destination in the person's own words — never "entity" or "record". */
  label: string;
}

/**
 * The editor for one scored thing.
 *
 * The id handed in is the ENTITY's, not the audit row's: `auditDetailParams`
 * puts `entityId` in the address, which is why a page check deep-links to a page
 * rather than to a scoring run. Checked against all four tables — a
 * `builder_page` id is a `builder_pages` row, `cms_page` a `content_entries`
 * row, `product` a `commerce_products` row, and `collection` a
 * `commerce_product_collections` row.
 *
 * The label is built from `entityLabel` rather than spelled out per case, so the
 * button and the line above the score cannot drift into calling the same thing
 * two names.
 */
export function fixTargetFor(type: EntityType, entityId: string): FixTarget {
  const label = `Edit this ${entityLabel(type).toLowerCase()}`;
  switch (type) {
    case 'cms_page':
      return {
        surface: 'cms.content.detail',
        params: { id: entityId },
        module: 'cms',
        icon: faFileText,
        label,
      };
    case 'product':
      return {
        surface: 'commerce.product.detail',
        params: { id: entityId },
        module: 'commerce',
        icon: faBox,
        label,
      };
    case 'collection':
      return {
        surface: 'commerce.collection.detail',
        params: { id: entityId },
        module: 'commerce',
        icon: faLayerGroup,
        label,
      };
    case 'builder_page':
      // `builder.page` takes `pageId`, not `id` — the one target whose param
      // name differs, and the reason this mapping is a function rather than a
      // record keyed by type.
      return {
        surface: 'builder.page',
        params: { pageId: entityId },
        module: 'builder',
        icon: faFileLines,
        label,
      };
  }
}

/** Same modifier contract as every list — a jump opens in a tab, alongside on
 *  shift, in a new window on alt. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/**
 * The jump as a toolbar action, or nothing when the destination is out of reach.
 *
 * GATED ON THE MODULE, not on the audit existing. An audit only gets written for
 * an entity that exists, so a product scorecard is usually proof commerce is on
 * — but a module turned OFF after its pages were scored leaves the rows behind,
 * and a button into a module the rail no longer shows lands nowhere. This asks
 * the same gate the rail and the command palette ask, rather than inventing a
 * third answer to the same question.
 */
export function useFixAction(
  ctx: SurfaceContext,
  type: EntityType,
  id: string
): ToolbarAction | undefined {
  const reachable = useReachableModules();
  const known = useKnownModules();
  return useMemo(() => {
    const target = fixTargetFor(type, id);
    if (!moduleIsVisible(target.module, reachable, known)) return undefined;
    return {
      label: target.label,
      icon: target.icon,
      module: target.module,
      onClick: (event) => {
        ctx.open(target.surface, target.params, { target: targetFor(event) });
      },
    };
  }, [ctx, type, id, reachable, known]);
}
