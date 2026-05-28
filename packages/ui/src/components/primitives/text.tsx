import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const textVariants = cva('', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    },
    variant: {
      default: 'text-[var(--color-text-primary)]',
      muted: 'text-[var(--color-text-secondary)]',
      subtle: 'text-[var(--color-text-tertiary)]',
      inverse: 'text-[var(--color-text-inverse)]',
      danger: 'text-[var(--color-danger-text)]',
      success: 'text-[var(--color-success-text)]',
    },
    weight: {
      regular: 'font-normal',
      medium: 'font-medium',
    },
  },
  defaultVariants: {
    size: 'sm',
    variant: 'default',
    weight: 'regular',
  },
});

type TextTag = 'p' | 'span' | 'div' | 'label';

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof textVariants> {
  as?: TextTag;
  htmlFor?: string;
}

export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, size, variant, weight, as = 'p', children, ...props }, ref) => {
    const Tag = as as 'p';
    return (
      <Tag
        ref={ref as React.Ref<HTMLParagraphElement>}
        className={cn(textVariants({ size, variant, weight }), className)}
        {...props}
      >
        {children}
      </Tag>
    );
  }
);
Text.displayName = 'Text';

export { textVariants };
