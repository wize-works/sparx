import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// Heading + Text are not in doc 23 §9's inventory, but they're necessary to
// keep feature pages free of raw Tailwind typography classes. Adding them
// here is a spec extension — flag if doc 23 should be updated to match.

const headingVariants = cva('font-medium tracking-tight text-[var(--color-text-primary)]', {
  variants: {
    level: {
      1: 'text-3xl leading-tight',
      2: 'text-2xl leading-tight',
      3: 'text-xl leading-snug',
      4: 'text-lg leading-snug',
      5: 'text-base',
      6: 'text-sm tracking-wider text-[var(--color-text-secondary)] uppercase',
    },
  },
  defaultVariants: { level: 2 },
});

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface HeadingProps
  extends
    React.HTMLAttributes<HTMLHeadingElement>,
    Omit<VariantProps<typeof headingVariants>, 'level'> {
  /** Visual size, 1 (largest) through 6 (smallest, eyebrow). Defaults to 2. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Render as a different heading tag than `level` implies (a11y override). */
  as?: HeadingTag;
}

export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 2, as, children, ...props }, ref) => {
    const Tag = (as ?? (`h${level}` as HeadingTag)) as 'h1';
    return (
      <Tag ref={ref} className={cn(headingVariants({ level }), className)} {...props}>
        {children}
      </Tag>
    );
  }
);
Heading.displayName = 'Heading';

export { headingVariants };
