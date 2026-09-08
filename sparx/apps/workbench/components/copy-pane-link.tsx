'use client';

// "Copy link" — the one control that makes deep linking a feature people can use
// rather than a capability the backend has.
//
// Everything else in this work makes an address WORK when someone clicks it.
// This is the half where someone MAKES one. Before it, the only links into the
// workbench were the ones services wrote; a person looking at an order and
// wanting to show it to a colleague had nothing to hand them, because the bar
// said `/` and the tab menu offered close and move.
//
// It copies an ABSOLUTE address with `?site=` on it, always, because the reader
// is by definition somewhere else: another window, another person, a chat
// message that outlives the session. A root-relative path would be useless the
// moment it left this browser, and an address without the business is one that
// opens the right screen against whatever data the reader happened to be on.
//
// It renders NOTHING when the pane has no address — a detail pane opened without
// its record, say. A copy-link control that hands over a link to the app in
// general, when someone asked for a link to this thing, is worse than no control:
// they will send it, and the person who receives it will not know what they were
// meant to be looking at.

import { useState } from 'react';
import { Button, Tooltip, useToast } from '@wizeworks/silicaui-react';
import { Check, Link2 } from 'lucide-react';
import { useActiveSiteSlug } from '../lib/api/shell-data';
import { useWorkbench } from '../lib/workbench/context';
import { usePaneId } from '../lib/workbench/pane-identity';
import { MENU_ROW, type ToolbarPresentation } from './toolbar-presentation';
import { shareableAddressForPane } from '../lib/workbench/address';
import { useShareAsParams } from '../lib/workbench/share-as';

/**
 * The address of the pane this control sits in, or null when there isn't one.
 *
 * Shared with the tab context menu so the two can never produce different links
 * for the same pane — which they would, eventually, as two implementations.
 *
 * A pane may DECLARE different params for links to it (lib/workbench/share-as.ts)
 * — that is how a pane that follows a selection, and therefore has no record in
 * its own params, still hands over a link that lands on what is on screen. The
 * declaration is consulted first and the descriptor is left alone, so the pane
 * goes on following while the link it produces is pinned.
 */
export function usePaneLink(paneId: string | null): string | null {
  const { controller } = useWorkbench();
  const siteSlug = useActiveSiteSlug();
  const shareAs = useShareAsParams(paneId);
  if (!paneId) return null;
  const descriptor = controller.getDescriptor(paneId);
  if (!descriptor) return null;
  return shareableAddressForPane(
    shareAs ? { ...descriptor, params: shareAs } : descriptor,
    siteSlug
  );
}

/**
 * Whether this pane has an address to share — i.e. whether `CopyPaneLink`
 * renders anything at all.
 *
 * PaneToolbar asks because a collapsed bar must never show an overflow trigger
 * over an empty popover. A pane with no filters, no actions and nothing to
 * refetch has only this control left to fold, so "is there a link?" is the
 * difference between a menu and a button that opens nothing.
 */
export function usePaneHasLink(): boolean {
  const paneId = usePaneId();
  return usePaneLink(paneId) !== null;
}

export function useCopyLink(): (link: string) => Promise<boolean> {
  const toast = useToast();
  return async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      // Clipboard access can be refused — an insecure context, a hardened
      // profile, a browser that wants a fresher user gesture than a menu click.
      // Showing the link is the fallback that still gets the job done: it can be
      // selected out of the toast by hand.
      toast.add({
        title: 'Could not copy that link',
        description: link,
        type: 'error',
      });
      return false;
    }
  };
}

/**
 * The toolbar's copy-link button.
 *
 * Mounted by `PaneToolbar` rather than by each surface, so every one of the 233
 * surfaces gets it from a single edit — and so a later change to how a link is
 * shared lands everywhere at once instead of needing a sweep.
 *
 * Colorless: this is chrome about the pane, not an action the surface offers. It
 * must not compete with the thing the pane exists to do, which is usually the
 * colored button a few pixels to its left.
 */
export function CopyPaneLink({
  presentation = 'bar',
}: { presentation?: ToolbarPresentation } = {}) {
  const paneId = usePaneId();
  const link = usePaneLink(paneId);
  const copyLink = useCopyLink();
  const [copied, setCopied] = useState(false);

  if (!link) return null;

  const copy = () => {
    void copyLink(link).then((ok) => {
      if (!ok) return;
      setCopied(true);
      // Long enough to register, short enough to be ready again before someone
      // reaches for the next one.
      setTimeout(() => {
        setCopied(false);
      }, 1600);
    });
  };

  // In the overflow popover there is no position to read and no hover to reveal
  // a tooltip, so the icon carries its label — see RefreshButton.
  if (presentation === 'menu') {
    return (
      <Button size="sm" variant="ghost" className={MENU_ROW} onClick={copy}>
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
        <span>{copied ? 'Link copied' : 'Copy a link to this'}</span>
      </Button>
    );
  }

  // Neither `color` nor `variant`: a bare `.btn` resolves to base-content, which
  // is the theme-correct ink for chrome that belongs to no module. `neutral` was
  // naming a color this control has no business choosing.
  return (
    <Tooltip content={copied ? 'Link copied' : 'Copy a link to this'}>
      <Button size="sm" shape="square" aria-label="Copy a link to this panel" onClick={copy}>
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
      </Button>
    </Tooltip>
  );
}
