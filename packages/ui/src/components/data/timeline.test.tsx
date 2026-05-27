import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Timeline,
  TimelineDescription,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from './timeline';

describe('Timeline', () => {
  it('renders a list of items with titles, descriptions, and times', () => {
    render(
      <Timeline aria-label="activity">
        <TimelineItem>
          <TimelineTitle>Order placed</TimelineTitle>
          <TimelineDescription>3 items, $148.20</TimelineDescription>
          <TimelineTime dateTime="2026-05-27T10:00:00Z">just now</TimelineTime>
        </TimelineItem>
        <TimelineItem showConnector={false}>
          <TimelineTitle>Payment received</TimelineTitle>
        </TimelineItem>
      </Timeline>
    );
    expect(screen.getByRole('list', { name: 'activity' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText('Payment received')).toBeInTheDocument();
    expect(screen.getByText('just now').tagName).toBe('TIME');
  });
});
