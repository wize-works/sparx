import * as React from 'react';
import { cn } from '../../utils/cn';

type Cols = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 12;
type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: Cols;
  /** Responsive cols at the `md` breakpoint. */
  mdCols?: Cols;
  /** Responsive cols at the `lg` breakpoint. */
  lgCols?: Cols;
  gap?: Gap;
}

const COLS: Record<Cols, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  8: 'grid-cols-8',
  9: 'grid-cols-9',
  12: 'grid-cols-12',
};

const MD_COLS: Record<Cols, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  8: 'md:grid-cols-8',
  9: 'md:grid-cols-9',
  12: 'md:grid-cols-12',
};

const LG_COLS: Record<Cols, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  8: 'lg:grid-cols-8',
  9: 'lg:grid-cols-9',
  12: 'lg:grid-cols-12',
};

const GAP: Record<Gap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
};

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ className, cols = 1, mdCols, lgCols, gap = 4, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'grid',
        COLS[cols],
        mdCols && MD_COLS[mdCols],
        lgCols && LG_COLS[lgCols],
        GAP[gap],
        className
      )}
      {...props}
    />
  )
);
Grid.displayName = 'Grid';
