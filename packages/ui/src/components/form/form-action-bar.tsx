import * as React from 'react';
import { cn } from '../../utils/cn';

// FormActionBar — the standard form footer (docs/34 §13). A right-aligned,
// top-bordered row for a form's actions: a ghost Cancel followed by the
// module-colored primary (Save / Create X). Layout only — the caller passes the
// Buttons, so it stays decoupled from the Button API.
//
//   <FormActionBar>
//     <Button variant="ghost" onClick={cancel}>Cancel</Button>
//     <Button color="module" type="submit">Create product</Button>
//   </FormActionBar>

export type FormActionBarProps = React.HTMLAttributes<HTMLDivElement>;

export const FormActionBar = React.forwardRef<HTMLDivElement, FormActionBarProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-2 flex items-center justify-end gap-2 border-t border-[var(--color-border-default)] pt-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
FormActionBar.displayName = 'FormActionBar';
