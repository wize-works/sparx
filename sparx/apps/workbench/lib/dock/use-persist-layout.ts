'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { DockviewApi } from 'dockview';
import { saveLayout } from '@/lib/workbench/persistence';
import type { WorkbenchController } from '@/lib/workbench/controller';
import { saveModeLayout } from '../mode-layouts';
import type { WindowMode } from '../window-mode';

/** Debounce layout writes — dragging a splitter fires continuously. */
const SAVE_DEBOUNCE_MS = 400;

export interface PersistLayoutOptions {
  api: RefObject<DockviewApi | null>;
  controller: WorkbenchController;
  siteKey: string;
  /** The presentation ON SCREEN, which is not always the one that was asked for. */
  appliedMode: RefObject<WindowMode | null>;
  /** Re-floor the canvas. Prompt, unlike the write. */
  fit: () => void;
}

/**
 * Write the arrangement down — once into the site's layout, and once into the
 * presentation it belongs to.
 *
 * A per-mode snapshot used to be written in ONE place: the moment you left that
 * mode. So nothing done INSIDE a presentation was recorded until you left it,
 * and that built a trap. Docked view came back as one pile, you switched
 * straight back to windows to get out of it — and the way out saved that pile
 * over the good arrangement. One bad restore locked itself in permanently, and
 * no amount of tidying could correct it, because tidying was never what got
 * saved.
 *
 * `appliedMode` rather than the requested mode, for the same reason: this is the
 * arrangement on screen, and it belongs to the presentation currently painting
 * it.
 */
export function usePersistLayout({
  api,
  controller,
  siteKey,
  appliedMode,
  fit,
}: PersistLayoutOptions): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return useCallback(() => {
    fit();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const dock = api.current;
      if (!dock) return;
      const grid = dock.toJSON();
      saveLayout(siteKey, grid, controller.snapshotDescriptors());
      const showing = appliedMode.current;
      if (showing) saveModeLayout(siteKey, showing, grid);
    }, SAVE_DEBOUNCE_MS);
  }, [api, appliedMode, controller, fit, siteKey]);
}
