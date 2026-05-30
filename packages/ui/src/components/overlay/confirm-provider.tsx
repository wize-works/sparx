'use client';

// Imperative confirm dialog. Mount <ConfirmProvider> once near the app root
// (next to <Toaster />), then any client component can do
//
//   const confirm = useConfirm();
//   const ok = await confirm({ title: '…', description: '…', tone: 'danger' });
//   if (!ok) return;
//
// instead of `window.confirm(...)`. One shared AlertDialog renders inside the
// provider, so confirms are always Sparx-styled and consistent — no native
// browser modal, no per-component AlertDialog boilerplate.

import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { buttonVariants } from '../primitives/button';
import { cn } from '../../utils/cn';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Visual tone of the confirm button.
   * - `danger` (default): red — for delete / revoke / permanent actions.
   * - `warning`: amber — for reversible-but-disruptive actions (credit hold, deactivate).
   * - `module`: the active module's accent — for neutral commits.
   */
  tone?: 'danger' | 'warning' | 'module';
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const handleResolve = React.useCallback(
    (ok: boolean) => {
      if (!pending) return;
      pending.resolve(ok);
      setPending(null);
    },
    [pending]
  );

  const tone = pending?.options.tone ?? 'danger';
  const actionClass = cn(
    buttonVariants({
      variant: tone === 'warning' ? 'warning' : tone === 'module' ? 'module' : 'danger',
      size: 'md',
    })
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) handleResolve(false);
        }}
      >
        {pending ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.options.title}</AlertDialogTitle>
              {pending.options.description ? (
                <AlertDialogDescription asChild>
                  <div>{pending.options.description}</div>
                </AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => handleResolve(false)}>
                {pending.options.cancelLabel ?? 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction className={actionClass} onClick={() => handleResolve(true)}>
                {pending.options.confirmLabel ?? 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(
      'useConfirm must be used inside a <ConfirmProvider>. Mount it at the app root next to <Toaster />.'
    );
  }
  return ctx;
}
