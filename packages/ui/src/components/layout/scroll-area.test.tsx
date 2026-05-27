import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollArea } from './scroll-area';

describe('ScrollArea', () => {
  it('renders children inside the viewport', () => {
    render(
      <ScrollArea data-testid="sa">
        <div>scrollable content</div>
      </ScrollArea>
    );
    expect(screen.getByText('scrollable content')).toBeInTheDocument();
  });
});
