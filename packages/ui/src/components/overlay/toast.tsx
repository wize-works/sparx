'use client';

import * as React from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

// Wraps sonner with Sparx tokens. Apps mount <Toaster /> once at the root and
// fire toasts via `toast.success(...)`, `toast.error(...)`, etc.

export const Toaster = (
  props: React.ComponentPropsWithoutRef<typeof SonnerToaster>
): React.ReactElement => (
  <SonnerToaster
    position="bottom-right"
    closeButton
    toastOptions={{
      classNames: {
        toast:
          'group rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-md',
        title: 'text-sm font-medium',
        description: 'text-xs text-[var(--color-text-secondary)]',
        actionButton:
          'rounded-md bg-[var(--sparx-primary)] px-2 py-1 text-xs font-medium text-white hover:bg-[var(--sparx-primary-hover)]',
        cancelButton:
          'rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]',
        success:
          'border-[var(--color-success)] text-[var(--color-success-text)] bg-[var(--color-success-tint)]',
        error:
          'border-[var(--color-danger)] text-[var(--color-danger-text)] bg-[var(--color-danger-tint)]',
        warning:
          'border-[var(--color-warning)] text-[var(--color-warning-text)] bg-[var(--color-warning-tint)]',
      },
    }}
    {...props}
  />
);

// Re-export sonner's `toast` so consumers do `import { toast } from '@sparx/ui'`.
export const toast = sonnerToast;
