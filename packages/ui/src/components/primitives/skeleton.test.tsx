import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders with pulse animation and is hidden from assistive tech', () => {
    const { container } = render(<Skeleton data-testid="sk" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/animate-pulse/);
    expect(el).toHaveAttribute('aria-hidden');
  });

  it('forwards className for sizing overrides', () => {
    const { container } = render(<Skeleton className="h-6 w-1/3" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/h-6/);
    expect(el.className).toMatch(/w-1\/3/);
  });
});
