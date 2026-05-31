import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// ButtonGroup — joins adjacent Buttons into a segmented control (docs/35
// Tier-C; DaisyUI `join`). It collapses the shared inner radii/borders so the
// children read as one control. Works with any button-like children.

const buttonGroupVariants = cva('isolate inline-flex', {
  variants: {
    orientation: {
      horizontal: cn(
        '[&>*:not(:first-child)]:-ml-px',
        '[&>*:not(:first-child)]:rounded-l-none',
        '[&>*:not(:last-child)]:rounded-r-none',
        'focus-within:[&>*]:z-10 hover:[&>*]:z-10'
      ),
      vertical: cn(
        'flex-col',
        '[&>*:not(:first-child)]:-mt-px',
        '[&>*:not(:first-child)]:rounded-t-none',
        '[&>*:not(:last-child)]:rounded-b-none'
      ),
    },
  },
  defaultVariants: { orientation: 'horizontal' },
});

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof buttonGroupVariants> {}

export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  )
);
ButtonGroup.displayName = 'ButtonGroup';

export { buttonGroupVariants };
