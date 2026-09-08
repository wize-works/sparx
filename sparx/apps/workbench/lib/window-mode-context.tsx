'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WindowMode } from './window-mode';

/**
 * Which presentation the workspace is in, for the chrome dockview renders.
 *
 * A title bar's buttons need it — "tidy this back into the grid" is not an
 * offer windows mode can make, because windows mode has no grid — and a header
 * action is mounted by dockview rather than by the shell, so a prop cannot
 * reach it. Context crosses the portal; the prop chain does not exist.
 */
const WindowModeContext = createContext<WindowMode | null>(null);

export function WindowModeProvider({
  mode,
  children,
}: {
  mode: WindowMode | null;
  children: ReactNode;
}) {
  return <WindowModeContext.Provider value={mode}>{children}</WindowModeContext.Provider>;
}

/** NULL while nobody has chosen — see ConsoleDock on why that is not 'tabs'. */
export function useWindowMode(): WindowMode | null {
  return useContext(WindowModeContext);
}
