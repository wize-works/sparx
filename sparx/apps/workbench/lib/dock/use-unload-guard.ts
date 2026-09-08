'use client';

import { useEffect } from 'react';
import type { WorkbenchController } from '@/lib/workbench/controller';

/**
 * The last line of defence for a hard browser nav — tab close, refresh, a popout
 * dismissed. The in-app guards cover every path we control; this covers the one
 * we don't. Browsers ignore the custom string and show their own wording.
 */
export function useUnloadGuard(controller: WorkbenchController): void {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // A site or business switch reloads on purpose after its own consent
      // dialog — prompting again cancels the reload and half-applies the switch.
      if (controller.isUnloadIntentional()) return;
      if (!controller.hasUnsavedWork()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [controller]);
}
