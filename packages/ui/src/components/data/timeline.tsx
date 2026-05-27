import * as React from 'react';
import { cn } from '../../utils/cn';

// Timeline — vertical event list with a connector line and per-item dots.
// Dots inherit the active module color via --module-active so order/activity
// feeds in CMS/CRM/etc. routes tint automatically.

export const Timeline = React.forwardRef<
  HTMLOListElement,
  React.HTMLAttributes<HTMLOListElement>
>(({ className, ...props }, ref) => (
  <ol ref={ref} className={cn('relative flex flex-col gap-4', className)} {...props} />
));
Timeline.displayName = 'Timeline';

export interface TimelineItemProps extends React.HTMLAttributes<HTMLLIElement> {
  /** Marker on the timeline. Defaults to a colored dot. */
  marker?: React.ReactNode;
  /** When true, draws the connector line below this item. False on the last item. */
  showConnector?: boolean;
}

export const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, marker, showConnector = true, children, ...props }, ref) => (
    <li ref={ref} className={cn('relative flex gap-3', className)} {...props}>
      <div className="flex flex-col items-center">
        {marker ?? (
          <span
            aria-hidden
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--module-active)]"
          />
        )}
        {showConnector && (
          <span aria-hidden className="mt-1 w-px flex-1 bg-[var(--color-border-default)]" />
        )}
      </div>
      <div className="flex-1 pb-2">{children}</div>
    </li>
  )
);
TimelineItem.displayName = 'TimelineItem';

export const TimelineTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn('text-sm font-medium text-[var(--color-text-primary)]', className)}
    {...props}
  />
);
TimelineTitle.displayName = 'TimelineTitle';

export const TimelineDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn('mt-0.5 text-xs text-[var(--color-text-secondary)]', className)}
    {...props}
  />
);
TimelineDescription.displayName = 'TimelineDescription';

export const TimelineTime = ({
  className,
  ...props
}: React.TimeHTMLAttributes<HTMLTimeElement>) => (
  <time
    className={cn('text-xs text-[var(--color-text-tertiary)]', className)}
    {...props}
  />
);
TimelineTime.displayName = 'TimelineTime';
